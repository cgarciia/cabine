from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect

from app.services.ble import ble_radio_lock
from app.services.ble.ws_session import DeviceWsSession, cancel_and_wait
from app.services.blood_pressure.hem6161 import (
    DEVICE_LABEL,
    connect_hem6161,
    wait_for_hem6161,
)
from app.services.blood_pressure.wrist_memory import WristProtocolError, pull_wrist_records
from app.services.blood_pressure.persist import save_blood_pressure_reading

logger = logging.getLogger(__name__)

SESSION_SKEW = timedelta(hours=12)
IDLE_STATUS = "Faça a medição no pulso. Quando o visor mostrar o valor, o totem busca a leitura salva."
MISSING_PROFILE_STATUS = "O monitor conectou, mas não entregou uma medição nova."


def _aware(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value
    return value.replace(tzinfo=datetime.now().astimezone().tzinfo)


def _resolved_address(query_address: str | None) -> str | None:
    raw = (query_address or "").strip().upper()
    return raw or None


async def stream_blood_pressure_wrist(
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
        device_address: str | None,
        sys_mmhg: int,
        dia_mmhg: int,
        pulse_bpm: int,
        movement: bool,
        irregular_heartbeat: bool,
        measured_at: datetime,
    ) -> bool:
        when = _aware(measured_at)
        if when < session_started_at:
            return False
        key = (sys_mmhg, dia_mmhg, pulse_bpm, when.replace(microsecond=0).isoformat())
        if key in delivered:
            return False
        if pulse_bpm < 40 or pulse_bpm > 180:
            return False
        if sys_mmhg < 60 or dia_mmhg < 40 or sys_mmhg > 299:
            return False
        delivered.add(key)
        payload = {
            "type": "BLOOD_PRESSURE",
            "device_name": DEVICE_LABEL,
            "device_address": device_address,
            "sys_mmhg": sys_mmhg,
            "dia_mmhg": dia_mmhg,
            "pulse_bpm": pulse_bpm,
            "movement": movement,
            "irregular_heartbeat": irregular_heartbeat,
            "measured_at": when.isoformat(),
            "stable": True,
        }
        await session.send_json(payload)
        pid = session.person_id
        if pid is not None:
            try:
                await save_blood_pressure_reading(
                    person_id=pid,
                    device_name=DEVICE_LABEL,
                    device_address=device_address,
                    sys_mmhg=sys_mmhg,
                    dia_mmhg=dia_mmhg,
                    pulse_bpm=pulse_bpm,
                    movement=movement,
                    irregular_heartbeat=irregular_heartbeat,
                    measured_at=when,
                    visit_id=session.visit_id,
                )
            except Exception:
                logger.exception("Failed to persist wrist blood pressure")
        return True

    try:
        await send_status(IDLE_STATUS)
        async with ble_radio_lock:
            while not cancelled():
                try:
                    device = await wait_for_hem6161(
                        preferred[0],
                        cancelled=cancelled,
                        on_waiting=send_status,
                    )
                except Exception:
                    logger.exception("HEM-6161T2 BLE scan failed")
                    await asyncio.sleep(2.0)
                    continue
                if device is None or cancelled():
                    break

                device_address = (device.address or "").upper() or preferred[0]
                if device_address:
                    preferred[0] = device_address
                await send_status("Monitor de pulso acordou. Buscando a medição salva…")
                try:
                    client = await connect_hem6161(device)
                except Exception:
                    logger.warning("HEM-6161T2 did not accept the connection; waiting for the next wake.")
                    await asyncio.sleep(2.0)
                    continue

                got_fresh = False
                try:
                    got_fresh = await _collect_stored_reading(
                        client,
                        emit_reading=lambda **kwargs: emit_reading(
                            device_address=device_address,
                            **kwargs,
                        ),
                        send_status=send_status,
                    )
                except WristProtocolError as exc:
                    logger.warning("HEM-6161T2 sync refused: %s", exc)
                    await send_status(str(exc))
                except Exception:
                    logger.exception("HEM-6161T2 session failed")
                finally:
                    try:
                        await client.disconnect()
                    except Exception:
                        logger.debug("HEM-6161T2 disconnect failed (ignored).", exc_info=True)

                if got_fresh:
                    await send_status("Leitura recebida.")
                    await asyncio.sleep(0.8)
                    break
                await send_status(IDLE_STATUS)
                await asyncio.sleep(1.5)
    except WebSocketDisconnect:
        logger.info("Frontend disconnected from the wrist blood-pressure session.")
    except Exception:
        logger.exception("Wrist blood-pressure stream failed")
        try:
            await send_status(IDLE_STATUS)
        except Exception:
            pass
    finally:
        await cancel_and_wait(client_task)


async def _collect_stored_reading(client, *, emit_reading, send_status) -> bool:
    records = await pull_wrist_records(client)
    fresh = [item for item in records if _aware(item["measured_at"]) >= session_floor()]
    if not fresh:
        await send_status(MISSING_PROFILE_STATUS)
        return False
    latest = max(fresh, key=lambda item: item["measured_at"])
    pulse = latest.get("pulse_bpm")
    if pulse is None:
        await send_status(MISSING_PROFILE_STATUS)
        return False
    return await emit_reading(
        sys_mmhg=latest["sys_mmhg"],
        dia_mmhg=latest["dia_mmhg"],
        pulse_bpm=int(pulse),
        movement=bool(latest.get("movement")),
        irregular_heartbeat=bool(latest.get("irregular_heartbeat")),
        measured_at=latest["measured_at"],
    )


def session_floor():
    return datetime.now().astimezone() - SESSION_SKEW
