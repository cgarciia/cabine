from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import authenticate_websocket, get_current_user, load_scoped_user, require_access
from app.models.admin import Admin
from app.models.user import User
from app.schemas.ble import BleScanResponse
from app.schemas.oximeter import OximeterReadingCreate, OximeterReadingResponse
from app.services.devices import resolve_paired_address
from app.services.oximeter.ble import scan_oximeters_locked
from app.services.oximeter.persist import store_oximeter_reading
from app.services.oximeter.stream import stream_oximeter

router = APIRouter(tags=["Oximeter"])


@router.get(
    "/oximeters/scan",
    response_model=BleScanResponse,
    dependencies=[Depends(get_current_user)],
)
async def scan_nearby_oximeters():
    devices = await scan_oximeters_locked(timeout=10.0)
    return BleScanResponse(devices=devices)


@router.post("/oximeters", response_model=OximeterReadingResponse, status_code=status.HTTP_201_CREATED)
async def create_oximeter_reading(
    payload: OximeterReadingCreate,
    db: AsyncSession = Depends(get_db),
    actor: User | Admin = Depends(require_access),
):
    await load_scoped_user(db, actor, payload.user_id)
    try:
        return await store_oximeter_reading(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.websocket("/ws/oximeter")
async def oximeter_endpoint(
    websocket: WebSocket,
    user_id: UUID | None = None,
    address: str | None = None,
    session_id: UUID | None = None,
    token: str | None = None,
):
    principal = await authenticate_websocket(websocket, token)
    if principal is None:
        return
    resolved = (address or "").strip() or await resolve_paired_address("oximeter")
    await stream_oximeter(
        websocket,
        user_id=principal.bound_user_id(user_id),
        address=resolved,
        session_id=session_id,
        person_locked=principal.person_locked,
    )
