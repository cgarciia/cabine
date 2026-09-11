from __future__ import annotations

import asyncio
import logging
import traceback
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
from app.services.oximeter.debuglog import dbg, session_banner
from app.services.oximeter.parsers import CreativeFrameBuffer
from app.services.oximeter.persist import save_oximeter_reading
from app.services.scale.adapters.ble_common import ble_radio_lock

logger = logging.getLogger(__name__)

STABLE_HITS = 6


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
) -> None:
    await websocket.accept()
    session_banner("ws/oximeter aberto")
    dbg("WS person_id=%s address=%s", person_id, address)
    person_id_box: list[UUID | None] = [person_id]
    preferred = [(address or "").strip().upper() or None]
    saved = False
    hits = 0
    last_key: tuple[int, int] | None = None

    async def send_status(msg: str) -> None:
        if websocket.client_state != WebSocketState.CONNECTED:
            return
        try:
            await websocket.send_json({"type": "STATUS", "msg": msg})
        except Exception as exc:
            dbg("send_status falhou: %s", exc)

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
        except Exception:
            return

    client_task = asyncio.create_task(listen_client())

    def cancelled() -> bool:
        return websocket.client_state != WebSocketState.CONNECTED
    try:
        await send_status("Procurando o oxímetro… coloque o dedo no sensor.")
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
                    dbg("SCAN exception:\n%s", traceback.format_exc())
                    await send_status("Procurando o oxímetro… coloque o dedo no sensor.")
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
                    dbg("CONNECT exception:\n%s", traceback.format_exc())
                    await send_status("Não conectou ainda. Mantenha o dedo no oxímetro.")
                    await asyncio.sleep(1.2)
                    continue

                if cancelled():
                    dbg("WS fechou durante CONNECT — soltando GATT")
                    try:
                        await client.disconnect()
                    except Exception:
                        pass
                    continue

                buffer = CreativeFrameBuffer()
                queue: asyncio.Queue[dict] = asyncio.Queue()
                got_data = {"n": 0}

                def on_notify(_sender, data: bytearray) -> None:
                    nonlocal hits, last_key, saved
                    got_data["n"] += 1
                    raw = bytes(data)
                    hexa = raw.hex(" ")
                    samples = buffer.feed(raw)
                    dbg(
                        "RX #%s sender=%s n=%s hex=%s parsed=%s",
                        got_data["n"],
                        _sender,
                        len(raw),
                        hexa,
                        len(samples),
                    )
                    if not samples:
                        # ACK/status sem SpO2 nem onda — não inventar waveform.
                        return
                    for sample in samples:
                        dbg(
                            "PARSE spo2=%s pr=%s finger=%s kind=%s wave=%s",
                            sample.spo2_pct,
                            sample.pulse_bpm,
                            sample.finger_on,
                            sample.kind,
                            list(sample.waveform)[:16],
                        )
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
                            if last_key == key:
                                hits += 1
                            else:
                                last_key = key
                                hits = 1
                            if hits >= STABLE_HITS:
                                payload["stable"] = True
                                pid = person_id_box[0]
                                if pid is not None and not saved:
                                    saved = True

                                    async def _persist() -> None:
                                        try:
                                            await save_oximeter_reading(
                                                person_id=pid,
                                                device_name=device_name,
                                                device_address=device_address,
                                                spo2_pct=sample.spo2_pct,
                                                pulse_bpm=sample.pulse_bpm,
                                                pi_pct=sample.pi_pct,
                                            )
                                        except Exception:
                                            nonlocal saved
                                            saved = False
                                            logger.exception("Falha ao salvar oximetria")

                                    asyncio.create_task(_persist())
                        elif sample.kind == "values" and not sample.finger_on:
                            hits = 0
                            last_key = None
                        queue.put_nowait(payload)

                try:
                    subscribed = await subscribe_notifications(client, on_notify)
                    dbg("SUBSCRIBE count=%s", subscribed)
                    if subscribed == 0:
                        await send_status("Conectou, mas o canal de dados não abriu. Tentando de novo…")
                        await client.disconnect()
                        await asyncio.sleep(1.0)
                        continue

                    await send_status("Conectado. Pedindo onda e números ao oxímetro…")
                    written = await write_start_stream(client, all_candidates=True)
                    dbg("HANDSHAKE writes=%s", written)
                    await send_status("Conectado. Mantenha o dedo parado.")
                    consumer = asyncio.create_task(_consume_queue(websocket, queue))
                    keepalive: asyncio.Task | None = None
                    try:
                        silent_for = 0.0
                        while client.is_connected and not cancelled():
                            await asyncio.sleep(0.4)
                            if got_data["n"] == 0:
                                silent_for += 0.4
                                if silent_for >= 2.0 and keepalive is None:
                                    dbg("silencio %.1fs — reenvio handshake", silent_for)
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
                await send_status("Procurando o oxímetro… coloque o dedo no sensor.")
                await asyncio.sleep(0.8)
    except WebSocketDisconnect:
        dbg("WS frontend desconectou")
        logger.info("Frontend desconectou da sessão do oxímetro.")
    except Exception:
        dbg("WS exception no stream:\n%s", traceback.format_exc())
        logger.exception("Falha no stream do oxímetro")
        try:
            await send_status("Falha ao ler o oxímetro. Mantendo a busca… coloque o dedo de novo.")
        except Exception:
            pass
    finally:
        dbg("WS sessao encerrada")
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
