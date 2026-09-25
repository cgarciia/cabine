from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect

from app.services.ble import ble_radio_lock
from app.services.ble.ws_session import DeviceWsSession, cancel_and_wait, consume_queue
from app.services.oximeter.ble import (
    YK81_DEVICE_NAME,
    connect_oximeter,
    is_yk81,
    keep_alive_stream,
    subscribe_notifications,
    subscribe_yk81,
    wait_for_oximeter,
    write_start_stream,
)
from app.services.oximeter.parsers import (
    NO_FINGER,
    CreativeFrameBuffer,
    OximeterSample,
    Yk81PacketBuffer,
)
from app.services.oximeter.persist import save_oximeter_reading

logger = logging.getLogger(__name__)

# 4 samples is enough for the kiosk: pulse rarely stays bit-identical for 6.
STABLE_HITS = 4
PULSE_TOLERANCE_BPM = 2


def _same_reading(previous: tuple[int, int], current: tuple[int, int]) -> bool:
    prev_spo2, prev_pulse = previous
    spo2, pulse = current
    return prev_spo2 == spo2 and abs(prev_pulse - pulse) <= PULSE_TOLERANCE_BPM


def _reading_payload(
    device_name: str,
    device_address: str | None,
    sample: OximeterSample = NO_FINGER,
    *,
    stable: bool = False,
    hits: int = 0,
) -> dict:
    return {
        "type": "OXIMETER",
        "device_name": device_name,
        "device_address": device_address,
        "spo2_pct": sample.spo2_pct,
        "pulse_bpm": sample.pulse_bpm,
        "pi_pct": sample.pi_pct,
        "finger_on": sample.finger_on,
        "stable": stable,
        "waveform": list(sample.waveform),
        "stable_hits": hits,
        "stable_needed": STABLE_HITS,
        "timestamp": datetime.now().strftime("%H:%M:%S"),
    }


async def stream_oximeter(
    websocket: WebSocket,
    person_id: UUID | None = None,
    address: str | None = None,
    visit_id: UUID | None = None,
    *,
    person_locked: bool = False,
) -> None:
    await websocket.accept()
    session = DeviceWsSession(
        websocket, person_id=person_id, visit_id=visit_id, person_locked=person_locked
    )
    send_status = session.send_status
    cancelled = session.cancelled
    preferred = [(address or "").strip().upper() or None]
    saved = False
    hits = 0
    last_key: tuple[int, int] | None = None

    client_task = asyncio.create_task(session.listen_person_messages())

    try:
        await send_status("Encaixe o dedo indicador no clipe e, se o oxímetro não ligar, aperte o botão.")
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
                    await send_status("Ainda procurando. Deixe o dedo no clipe e confira se o oxímetro está ligado.")
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

                yk81 = is_yk81(client)
                if yk81:
                    device_name = YK81_DEVICE_NAME
                buffer = Yk81PacketBuffer() if yk81 else CreativeFrameBuffer()
                queue: asyncio.Queue[dict] = asyncio.Queue()
                packets = 0
                wave_acc: list[int] = []

                def on_notify(_sender, data: bytearray) -> None:
                    nonlocal hits, last_key, saved, packets
                    packets += 1
                    for sample in buffer.feed(bytes(data)):
                        if sample.waveform:
                            wave_acc.extend(sample.waveform)
                            del wave_acc[:-480]
                        stable = False
                        if sample.finger_on and sample.spo2_pct and sample.pulse_bpm:
                            key = (sample.spo2_pct, sample.pulse_bpm)
                            if last_key is not None and _same_reading(last_key, key):
                                hits += 1
                            else:
                                last_key = key
                                hits = 1
                            if hits >= STABLE_HITS:
                                stable = True
                                pid = session.person_id
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
                                                visit_id=session.visit_id,
                                                waveform=wave_snapshot or None,
                                            )
                                        except Exception:
                                            nonlocal saved
                                            saved = False
                                            logger.exception("Falha ao salvar oximetria")

                                    session.spawn(_persist())
                        elif sample.kind == "values" and not sample.finger_on:
                            hits = 0
                            last_key = None
                            wave_acc.clear()
                        queue.put_nowait(
                            _reading_payload(device_name, device_address, sample, stable=stable, hits=hits)
                        )

                try:
                    if yk81:
                        subscribed = await subscribe_yk81(client, on_notify)
                    else:
                        subscribed = await subscribe_notifications(client, on_notify)
                    if subscribed == 0:
                        await send_status("Conectou, mas o canal de dados não abriu. Tentando de novo…")
                        await client.disconnect()
                        await asyncio.sleep(1.0)
                        continue

                    if not yk81:
                        await send_status("Conectado. Pedindo a leitura ao oxímetro…")
                        await write_start_stream(client, all_candidates=True)
                    await send_status("Conectado. Fique parado: a cabine espera o sinal ficar estável.")
                    consumer = asyncio.create_task(consume_queue(websocket, queue))
                    keepalive: asyncio.Task | None = None
                    try:
                        silent_for = 0.0
                        while client.is_connected and not cancelled():
                            await asyncio.sleep(0.4)
                            if yk81:
                                continue
                            if packets == 0:
                                silent_for += 0.4
                                if silent_for >= 2.0 and keepalive is None:
                                    await write_start_stream(client, all_candidates=True)
                                    keepalive = asyncio.create_task(keep_alive_stream(client))
                            elif keepalive is None:
                                keepalive = asyncio.create_task(keep_alive_stream(client, interval=3.0))
                    finally:
                        await cancel_and_wait(keepalive, consumer)
                finally:
                    try:
                        await client.disconnect()
                    except Exception:
                        logger.debug("Falha ao desconectar oxímetro (ignorada).", exc_info=True)

                if cancelled():
                    break
                if yk81:
                    hits = 0
                    last_key = None
                    await session.send_json(_reading_payload(device_name, device_address))
                    await send_status("O oxímetro desligou. Encaixe o dedo e aperte o botão para ligar de novo.")
                    await asyncio.sleep(0.8)
                    continue
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
        await cancel_and_wait(client_task)
        await session.drain()
