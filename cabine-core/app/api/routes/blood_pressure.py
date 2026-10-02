from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import authenticate_websocket, get_current_user, load_scoped_user, require_access
from app.models.admin import Admin
from app.models.user import User
from app.schemas.ble import BleScanResponse
from app.schemas.blood_pressure import BloodPressureReadingCreate, BloodPressureReadingResponse
from app.services.ble import ble_radio_lock
from app.services.blood_pressure.ble import scan_hem7530
from app.services.blood_pressure.hem6161 import scan_hem6161
from app.services.blood_pressure.persist import store_blood_pressure_reading
from app.services.blood_pressure.stream import stream_blood_pressure
from app.services.blood_pressure.wrist_stream import stream_blood_pressure_wrist
from app.services.devices import resolve_paired_address

router = APIRouter(tags=["BloodPressure"])


@router.get(
    "/blood-pressures/scan",
    response_model=BleScanResponse,
    dependencies=[Depends(get_current_user)],
)
async def scan_nearby_monitors():
    async with ble_radio_lock:
        devices = await scan_hem7530(timeout=10.0)
    return BleScanResponse(devices=devices)


@router.get(
    "/blood-pressures/wrist/scan",
    response_model=BleScanResponse,
    dependencies=[Depends(get_current_user)],
)
async def scan_nearby_wrist_monitors():
    async with ble_radio_lock:
        devices = await scan_hem6161(timeout=10.0)
    return BleScanResponse(devices=devices)


@router.post(
    "/blood-pressures",
    response_model=BloodPressureReadingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_blood_pressure_reading(
    payload: BloodPressureReadingCreate,
    db: AsyncSession = Depends(get_db),
    actor: User | Admin = Depends(require_access),
):
    await load_scoped_user(db, actor, payload.user_id)
    try:
        return await store_blood_pressure_reading(db, payload, slug="blood_pressure_ecg")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.websocket("/ws/blood-pressure")
async def blood_pressure_endpoint(
    websocket: WebSocket,
    user_id: UUID | None = None,
    address: str | None = None,
    session_id: UUID | None = None,
    token: str | None = None,
):
    principal = await authenticate_websocket(websocket, token)
    if principal is None:
        return
    resolved = (address or "").strip() or await resolve_paired_address("blood_pressure_ecg")
    await stream_blood_pressure(
        websocket,
        user_id=principal.bound_user_id(user_id),
        address=resolved,
        session_id=session_id,
        person_locked=principal.person_locked,
    )


@router.websocket("/ws/blood-pressure-wrist")
async def wrist_blood_pressure_endpoint(
    websocket: WebSocket,
    user_id: UUID | None = None,
    address: str | None = None,
    session_id: UUID | None = None,
    token: str | None = None,
):
    principal = await authenticate_websocket(websocket, token)
    if principal is None:
        return
    resolved = (address or "").strip() or await resolve_paired_address("blood_pressure_wrist")
    await stream_blood_pressure_wrist(
        websocket,
        user_id=principal.bound_user_id(user_id),
        address=resolved,
        session_id=session_id,
        person_locked=principal.person_locked,
    )
