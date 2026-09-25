from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect

from app.services.ble import ble_radio_lock
from app.services.ble.ws_session import DeviceWsSession, cancel_and_wait
from app.services.blood_pressure.ble import DEVICE_LABEL, connect_hem7530, wait_for_hem7530
from app.services.blood_pressure.gatt_bp import BP_MEASUREMENT_UUID, LIVE_NOTIFY_UUID, parse_bp_measurement
from app.services.blood_pressure.hem7530 import pick_latest_record
from app.services.blood_pressure.persist import save_blood_pressure_reading
from app.services.blood_pressure.protocol import Hem7530Session

logger = logging.getLogger(__name__)

SESSION_SKEW = timedelta(seconds=45)
IDLE_STATUS = "Pareado. Coloque o manguito, toque nos sensores e meça."


def _aware(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value
    return value.replace(tzinfo=datetime.now().astimezone().tzinfo)


def _resolved_address(query_address: str | None) -> str | None:
    raw = (query_address or "").strip().upper()
    return raw or None


async def stream_blood_pressure(
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
    preferred = [_resolved_address(address)]
    delivered: set[tuple] = set()
    session_started_at = datetime.now().astimezone() - SESSION_SKEW

    client_task = asyncio.create_task(session.listen_person_messages())

    async def emit_reading(
        *,
        device_name: str,
        device_address: str | None,
        sys_mmhg: int,
        dia_mmhg: int,
        pulse_bpm: int,
        movement: bool,
        irregular_heartbeat: bool,
        measured_at: datetime,
    ) -> bool:
        key = (sys_mmhg, dia_mmhg, pulse_bpm, measured_at.replace(microsecond=0).isoformat())
        if key in delivered:
            return False
        if pulse_bpm < 30 or pulse_bpm > 240:
            return False
        if sys_mmhg < 60 or dia_mmhg < 40:
            return False
        delivered.add(key)
        payload = {
            "type": "BLOOD_PRESSURE",
            "device_name": device_name,
            "device_address": device_address,
            "sys_mmhg": sys_mmhg,
            "dia_mmhg": dia_mmhg,
            "pulse_bpm": pulse_bpm,
            "movement": movement,
            "irregular_heartbeat": irregular_heartbeat,
            "measured_at": _aware(measured_at).isoformat(),
            "stable": True,
        }
        await session.send_json(payload)
        pid = session.person_id
        if pid is not None:
            try:
                await save_blood_pressure_reading(
                    person_id=pid,
                    device_name=device_name,
                    device_address=device_address,
                    sys_mmhg=sys_mmhg,
                    dia_mmhg=dia_mmhg,
                    pulse_bpm=pulse_bpm,
                    movement=movement,
                    irregular_heartbeat=irregular_heartbeat,
                    measured_at=_aware(measured_at),
                    visit_id=session.visit_id,
                )
            except Exception:
                logger.exception("Failed to persist blood pressure")
        return True

    try:
        await send_status(IDLE_STATUS)
        async with ble_radio_lock:
            while not cancelled():
                try:
                    device = await wait_for_hem7530(
                        preferred[0],
                        cancelled=cancelled,
                        on_waiting=send_status,
                    )
                except Exception:
                    logger.exception("HEM-7530T BLE scan failed")
                    await asyncio.sleep(2.0)
                    continue
                if device is None or cancelled():
                    break

                device_name = device.name or DEVICE_LABEL
                device_address = (device.address or "").upper() or preferred[0]
                if device_address:
                    preferred[0] = device_address
                await send_status("Monitor acordou. Aguardando o fim da medição…")
                try:
                    client = await connect_hem7530(device)
                except Exception:
                    logger.warning("HEM-7530T did not accept the connection; waiting for the next wake.")
                    await asyncio.sleep(2.0)
                    continue

                got_fresh = False
                try:
                    got_fresh = await _collect_from_session(
                        client,
                        emit_reading=lambda **kwargs: emit_reading(
                            device_name=device_name,
                            device_address=device_address,
                            **kwargs,
                        ),
                        cancelled=cancelled,
                        send_status=send_status,
                        session_started_at=session_started_at,
                    )
                except Exception:
                    logger.exception("HEM-7530T session failed")
                finally:
                    try:
                        await client.disconnect()
                    except Exception:
                        logger.debug("HEM-7530T disconnect failed (ignored).", exc_info=True)

                if got_fresh:
                    await send_status("Leitura recebida.")
                    await asyncio.sleep(0.8)
                    break
                await send_status(IDLE_STATUS)
                await asyncio.sleep(1.5)
    except WebSocketDisconnect:
        logger.info("Frontend disconnected from the blood-pressure session.")
    except Exception:
        logger.exception("Blood-pressure stream failed")
        try:
            await send_status(IDLE_STATUS)
        except Exception:
            pass
    finally:
        await cancel_and_wait(client_task)


async def _collect_from_session(
    client,
    *,
    emit_reading,
    cancelled,
    send_status,
    session_started_at: datetime,
) -> bool:
    queue: asyncio.Queue[tuple[str, object]] = asyncio.Queue()

    def on_bp(_sender, data: bytearray) -> None:
        parsed = parse_bp_measurement(bytes(data))
        if parsed:
            queue.put_nowait(("bp", parsed))

    def on_live(_sender, data: bytearray) -> None:
        if data:
            queue.put_nowait(("wave", list(data)))

    subscribed = False
    try:
        await client.start_notify(BP_MEASUREMENT_UUID, on_bp)
        subscribed = True
    except Exception:
        logger.debug("Indication 0x2A35 unavailable on this connection.", exc_info=True)
    try:
        await client.start_notify(LIVE_NOTIFY_UUID, on_live)
    except Exception:
        logger.debug("Extra HEM-7530T notify unavailable.", exc_info=True)

    if subscribed:
        await send_status("Toque nos sensores e permaneça parado. Aguardando a medição…")
        deadline = asyncio.get_running_loop().time() + 8.0
        while not cancelled() and client.is_connected and asyncio.get_running_loop().time() < deadline:
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                break
            try:
                kind, payload = await asyncio.wait_for(queue.get(), timeout=min(1.0, remaining))
            except TimeoutError:
                continue
            if kind != "bp" or not isinstance(payload, dict):
                continue
            pulse = payload.get("pulse_bpm")
            if pulse is None:
                continue
            ok = await emit_reading(
                sys_mmhg=payload["sys_mmhg"],
                dia_mmhg=payload["dia_mmhg"],
                pulse_bpm=int(pulse),
                movement=bool(payload.get("movement")),
                irregular_heartbeat=bool(payload.get("irregular_heartbeat")),
                measured_at=payload["measured_at"],
            )
            if ok:
                return True

    try:
        session = Hem7530Session(client)
        records = await session.read_records()
        latest = pick_latest_record(records)
        measured_at = _aware(latest["measured_at"]) if latest else None
        if latest and measured_at is not None and measured_at >= session_started_at:
            await emit_reading(
                sys_mmhg=latest["sys_mmhg"],
                dia_mmhg=latest["dia_mmhg"],
                pulse_bpm=latest["pulse_bpm"],
                movement=latest["movement"],
                irregular_heartbeat=latest["irregular_heartbeat"],
                measured_at=latest["measured_at"],
            )
            return True
        logger.info("HEM-7530T EEPROM has no measurement from this session; waiting for the next cycle.")
    except Exception:
        logger.debug("HEM-7530T EEPROM read did not succeed on this connection.", exc_info=True)
    return False
