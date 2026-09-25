from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import authenticate_websocket, get_current_user, load_scoped_person, require_access
from app.models.person import ScalePerson
from app.models.user import User
from app.schemas.ble import BleScanResponse
from app.schemas.blood_pressure import BloodPressureReadingCreate, BloodPressureReadingResponse
from app.services.ble import ble_radio_lock
from app.services.blood_pressure.ble import scan_hem7530
from app.services.blood_pressure.persist import store_blood_pressure_reading
from app.services.blood_pressure.stream import stream_blood_pressure

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


@router.post(
    "/blood-pressures",
    response_model=BloodPressureReadingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_blood_pressure_reading(
    payload: BloodPressureReadingCreate,
    db: AsyncSession = Depends(get_db),
    actor: ScalePerson | User = Depends(require_access),
):
    await load_scoped_person(db, actor, payload.person_id)
    return await store_blood_pressure_reading(db, payload)


@router.websocket("/ws/blood-pressure")
async def blood_pressure_endpoint(
    websocket: WebSocket,
    person_id: UUID | None = None,
    address: str | None = None,
    visit_id: UUID | None = None,
    token: str | None = None,
):
    principal = await authenticate_websocket(websocket, token)
    if principal is None:
        return
    await stream_blood_pressure(
        websocket,
        person_id=principal.bound_person_id(person_id),
        address=address,
        visit_id=visit_id,
        person_locked=principal.person_locked,
    )
