from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.services.oximeter.ble import (
    connect_oximeter,
    keep_alive_stream,
    subscribe_notifications,
    wait_for_oximeter,
    write_start_stream,
)
from app.services.oximeter.parsers import CreativeFrameBuffer
from app.services.oximeter.persist import save_oximeter_reading
from app.services.ble import ble_radio_lock

logger = logging.getLogger(__name__)

# 4 samples is enough for the kiosk: pulse rarely stays bit-identical for 6.
STABLE_HITS = 4
PULSE_TOLERANCE_BPM = 2


def _same_reading(previous: tuple[int, int], current: tuple[int, int]) -> bool:
    prev_spo2, prev_pulse = previous
    spo2, pulse = current
    return prev_spo2 == spo2 and abs(prev_pulse - pulse) <= PULSE_TOLERANCE_BPM


def _as_uuid(value) -> UUID | None:
    if value is None or value == "":
        return None
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


async def stream_oximeter(
    websocket: WebSocket,
    person_id: UUID | None = None,
    address: str | None = None,
    visit_id: UUID | None = None,
) -> None:
    await websocket.accept()
    person_id_box: list[UUID | None] = [person_id]
    visit_id_box: list[UUID | None] = [visit_id]
    preferred = [(address or "").strip().upper() or None]
    saved = False
    hits = 0
    last_key: tuple[int, int] | None = None

    async def send_status(msg: str) -> None:
        if websocket.client_state != WebSocketState.CONNECTED:
            return
        try:
            await websocket.send_json({"type": "STATUS", "msg": msg})
        except Exception:
            return

    async def listen_client() -> None:
        try:
            while websocket.client_state == WebSocketState.CONNECTED:
                raw = await websocket.receive_json()
                if not isinstance(raw, dict):
                    continue
                if raw.get("type") == "PERSON":
                    pid = _as_uuid(raw.get("person_id"))
                    if pid is not None:
                        person_id_box[0] = pid
                    vid = _as_uuid(raw.get("visit_id"))
                    if vid is not None:
                        visit_id_box[0] = vid
        except Exception:
            return

    client_task = asyncio.create_task(listen_client())

    def cancelled() -> bool:
        return websocket.client_state != WebSocketState.CONNECTED
    try:
        await send_status("Ligando o oxímetro. Encaixe o dedo indicador no clipe — a espera faz parte.")
        async with ble_radio_lock:
            while not cancelled():
                try:
                    device = await wait_for_oximeter(
                        preferred[0],
                        cancelled=cancelled,
                        on_waiting=send_status,
                    )
                except Exception:
                    logger.exception("Varredura BLE do oxímetro falhou")
                    await send_status("Ainda procurando. Deixe o dedo no clipe; o aparelho liga sozinho.")
                    await asyncio.sleep(1.5)
                    continue
                if device is None or cancelled():
                    break
                device_name = device.name or "PC-60NW"
                device_address = (device.address or "").upper() or None
                if device_address:
                    preferred[0] = device_address
                await send_status("Aparelho encontrado. Conectando…")
                try:
                    client = await connect_oximeter(device)
                except Exception:
                    logger.exception("Falha ao conectar no oxímetro")
                    await send_status("Ainda conectando. Mantenha o dedo no clipe — isso é normal.")
                    await asyncio.sleep(1.2)
                    continue

                if cancelled():
                    try:
                        await client.disconnect()
                    except Exception:
                        pass
                    continue

                buffer = CreativeFrameBuffer()
                queue: asyncio.Queue[dict] = asyncio.Queue()
                got_data = {"n": 0}
                wave_acc: list[int] = []

                def on_notify(_sender, data: bytearray) -> None:
                    nonlocal hits, last_key, saved
                    got_data["n"] += 1
                    raw = bytes(data)
                    samples = buffer.feed(raw)
                    if not samples:
                        # ACK/status sem SpO2 nem onda — não inventar waveform.
                        return
                    for sample in samples:
                        if sample.waveform:
                            wave_acc.extend(sample.waveform)
                            del wave_acc[:-480]
                        payload = {
                            "type": "OXIMETER",
                            "device_name": device_name,
                            "device_address": device_address,
                            "spo2_pct": sample.spo2_pct,
                            "pulse_bpm": sample.pulse_bpm,
                            "finger_on": sample.finger_on,
                            "stable": False,
                            "waveform": list(sample.waveform),
                            "timestamp": datetime.now().strftime("%H:%M:%S"),
                        }
                        if sample.finger_on and sample.spo2_pct and sample.pulse_bpm:
                            key = (sample.spo2_pct, sample.pulse_bpm)
                            if last_key is not None and _same_reading(last_key, key):
                                hits += 1
                            else:
                                last_key = key
                                hits = 1
                            if hits >= STABLE_HITS:
                                payload["stable"] = True
                                pid = person_id_box[0]
                                if pid is not None and not saved:
                                    saved = True
                                    wave_snapshot = list(wave_acc[-220:])

                                    async def _persist() -> None:
                                        try:
                                            await save_oximeter_reading(
                                                person_id=pid,
                                                device_name=device_name,
                                                device_address=device_address,
                                                spo2_pct=sample.spo2_pct,
                                                pulse_bpm=sample.pulse_bpm,
                                                pi_pct=sample.pi_pct,
                                                visit_id=visit_id_box[0],
                                                waveform=wave_snapshot or None,
                                            )
                                        except Exception:
                                            nonlocal saved
                                            saved = False
                                            logger.exception("Falha ao salvar oximetria")

                                    asyncio.create_task(_persist())
                        elif sample.kind == "values" and not sample.finger_on:
                            hits = 0
                            last_key = None
                            wave_acc.clear()
                        payload["stable_hits"] = hits
                        payload["stable_needed"] = STABLE_HITS
                        queue.put_nowait(payload)

                try:
                    subscribed = await subscribe_notifications(client, on_notify)
                    if subscribed == 0:
                        await send_status("Conectou, mas o canal de dados não abriu. Tentando de novo…")
                        await client.disconnect()
                        await asyncio.sleep(1.0)
                        continue

                    await send_status("Conectado. Pedindo a leitura ao oxímetro…")
                    await write_start_stream(client, all_candidates=True)
                    await send_status("Conectado. Fique parado: a cabine espera o sinal ficar estável.")
                    consumer = asyncio.create_task(_consume_queue(websocket, queue))
                    keepalive: asyncio.Task | None = None
                    try:
                        silent_for = 0.0
                        while client.is_connected and not cancelled():
                            await asyncio.sleep(0.4)
                            if got_data["n"] == 0:
                                silent_for += 0.4
                                if silent_for >= 2.0 and keepalive is None:
                                    await write_start_stream(client, all_candidates=True)
                                    keepalive = asyncio.create_task(keep_alive_stream(client))
                            elif keepalive is None:
                                keepalive = asyncio.create_task(keep_alive_stream(client, interval=3.0))
                    finally:
                        if keepalive is not None:
                            keepalive.cancel()
                        consumer.cancel()
                        for task in (keepalive, consumer):
                            if task is None:
                                continue
                            try:
                                await task
                            except asyncio.CancelledError:
                                pass
                finally:
                    try:
                        await client.disconnect()
                    except Exception:
                        logger.debug("Falha ao desconectar oxímetro (ignorada).", exc_info=True)

                if cancelled():
                    break
                await send_status("Reconectando. Mantenha o dedo no clipe.")
                await asyncio.sleep(0.8)
    except WebSocketDisconnect:
        logger.info("Frontend desconectou da sessão do oxímetro.")
    except Exception:
        logger.exception("Falha no stream do oxímetro")
        try:
            await send_status("Falha ao ler o oxímetro. Mantendo a busca… coloque o dedo de novo.")
        except Exception:
            pass
    finally:
        client_task.cancel()
        try:
            await client_task
        except asyncio.CancelledError:
            pass


async def _consume_queue(websocket: WebSocket, queue: asyncio.Queue) -> None:
    while websocket.client_state == WebSocketState.CONNECTED:
        data = await queue.get()
        try:
            await websocket.send_json(data)
        except Exception:
            return
