from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.core.config import settings
from app.services.ble import ble_radio_lock
from app.services.omron.ble import connect_omron, wait_for_omron
from app.services.omron.gatt_bp import BP_MEASUREMENT_UUID, LIVE_NOTIFY_UUID, parse_bp_measurement
from app.services.omron.hem7530 import pick_latest_record
from app.services.omron.persist import save_blood_pressure_reading
from app.services.omron.protocol import OmronSession

logger = logging.getLogger(__name__)

FRESH_WINDOW = timedelta(minutes=8)
IDLE_STATUS = "Pareado. Coloque o manguito, toque nos sensores e meça."


def _as_uuid(value) -> UUID | None:
    if value is None or value == "":
        return None
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _aware(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value
    return value.replace(tzinfo=datetime.now().astimezone().tzinfo)


def _is_fresh(measured_at: datetime) -> bool:
    now = datetime.now().astimezone()
    return abs(now - _aware(measured_at)) <= FRESH_WINDOW


def _resolved_address(query_address: str | None) -> str | None:
    raw = (query_address or settings.OMRON_ADDRESS or "").strip().upper()
    return raw or None


async def stream_blood_pressure(
    websocket: WebSocket,
    person_id: UUID | None = None,
    address: str | None = None,
    visit_id: UUID | None = None,
) -> None:
    await websocket.accept()
    person_id_box: list[UUID | None] = [person_id]
    visit_id_box: list[UUID | None] = [visit_id]
    preferred = [_resolved_address(address)]
    delivered: set[tuple] = set()

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
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.send_json(payload)
        pid = person_id_box[0]
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
                    visit_id=visit_id_box[0],
                )
            except Exception:
                logger.exception("Falha ao salvar pressão")
        return True

    try:
        await send_status(IDLE_STATUS)
        async with ble_radio_lock:
            while not cancelled():
                try:
                    device = await wait_for_omron(
                        preferred[0],
                        cancelled=cancelled,
                        on_waiting=send_status,
                    )
                except Exception:
                    logger.exception("Varredura BLE do Omron falhou")
                    await asyncio.sleep(2.0)
                    continue
                if device is None or cancelled():
                    break

                device_name = device.name or "OMRON Complete"
                device_address = (device.address or "").upper() or preferred[0]
                if device_address:
                    preferred[0] = device_address
                await send_status("Monitor acordou. Aguardando o fim da medição…")
                try:
                    client = await connect_omron(device)
                except Exception:
                    logger.warning("Complete ainda não aceitou a conexão; esperando a próxima vez que acordar.")
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
                    )
                except Exception:
                    logger.exception("Sessão Omron falhou")
                finally:
                    try:
                        await client.disconnect()
                    except Exception:
                        logger.debug("Falha ao desconectar Omron (ignorada).", exc_info=True)

                if got_fresh:
                    await send_status("Leitura recebida.")
                    await asyncio.sleep(0.8)
                    break
                await send_status(IDLE_STATUS)
                await asyncio.sleep(1.5)
    except WebSocketDisconnect:
        logger.info("Frontend desconectou da sessão de pressão.")
    except Exception:
        logger.exception("Falha no stream de pressão")
        try:
            await send_status(IDLE_STATUS)
        except Exception:
            pass
    finally:
        client_task.cancel()
        try:
            await client_task
        except asyncio.CancelledError:
            pass


async def _collect_from_session(client, *, emit_reading, cancelled, send_status) -> bool:
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
        logger.debug("Indicação 0x2A35 indisponível nesta conexão.", exc_info=True)
    try:
        await client.start_notify(LIVE_NOTIFY_UUID, on_live)
    except Exception:
        logger.debug("Notify extra Omron indisponível.", exc_info=True)

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
        session = OmronSession(client)
        records = await session.read_hem7530_records()
        latest = pick_latest_record(records)
        if latest and _is_fresh(latest["measured_at"]):
            await emit_reading(
                sys_mmhg=latest["sys_mmhg"],
                dia_mmhg=latest["dia_mmhg"],
                pulse_bpm=latest["pulse_bpm"],
                movement=latest["movement"],
                irregular_heartbeat=latest["irregular_heartbeat"],
                measured_at=latest["measured_at"],
            )
            return True
        logger.info("Memória Omron sem medição recente; continua esperando o próximo ciclo.")
    except Exception:
        logger.debug("Leitura EEPROM Omron não veio nesta conexão.", exc_info=True)
    return False
