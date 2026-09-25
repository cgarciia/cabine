from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import authenticate_websocket, get_current_user, load_scoped_person, require_access
from app.models.person import ScalePerson
from app.models.user import User
from app.schemas.ble import BleScanResponse
from app.schemas.oximeter import OximeterReadingCreate, OximeterReadingResponse
from app.services.ble import ble_radio_lock
from app.services.oximeter.ble import scan_oximeters
from app.services.oximeter.persist import store_oximeter_reading
from app.services.oximeter.stream import stream_oximeter

router = APIRouter(tags=["Oximeter"])


@router.get(
    "/oximeters/scan",
    response_model=BleScanResponse,
    dependencies=[Depends(get_current_user)],
)
async def scan_nearby_oximeters():
    async with ble_radio_lock:
        devices = await scan_oximeters(timeout=10.0)
    return BleScanResponse(devices=devices)


@router.post("/oximeters", response_model=OximeterReadingResponse, status_code=status.HTTP_201_CREATED)
async def create_oximeter_reading(
    payload: OximeterReadingCreate,
    db: AsyncSession = Depends(get_db),
    actor: ScalePerson | User = Depends(require_access),
):
    await load_scoped_person(db, actor, payload.person_id)
    return await store_oximeter_reading(db, payload)


@router.websocket("/ws/oximeter")
async def oximeter_endpoint(
    websocket: WebSocket,
    person_id: UUID | None = None,
    address: str | None = None,
    visit_id: UUID | None = None,
    token: str | None = None,
):
    principal = await authenticate_websocket(websocket, token)
    if principal is None:
        return
    await stream_oximeter(
        websocket,
        person_id=principal.bound_person_id(person_id),
        address=address,
        visit_id=visit_id,
        person_locked=principal.person_locked,
    )
