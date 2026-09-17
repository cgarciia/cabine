from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import authenticate_websocket, require_access
from app.crud import oximeter_reading as oximeter_crud
from app.crud import person as person_crud
from app.schemas.oximeter import OximeterReadingCreate, OximeterReadingResponse, OximeterScanResponse
from app.services.oximeter.ble import scan_oximeters
from app.services.oximeter.stream import stream_oximeter
from app.services.ble import ble_radio_lock

router = APIRouter(tags=["Oximeter"])
protected = APIRouter(dependencies=[Depends(require_access)])


@protected.get("/oximeters/scan", response_model=OximeterScanResponse)
async def scan_nearby_oximeters():
    async with ble_radio_lock:
        devices = await scan_oximeters(timeout=10.0)
    return OximeterScanResponse(devices=devices)


@protected.get("/oximeters", response_model=list[OximeterReadingResponse])
async def list_oximeter_readings(person_id: UUID, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    return await oximeter_crud.list_by_person(db, person_id)


@protected.post("/oximeters", response_model=OximeterReadingResponse, status_code=status.HTTP_201_CREATED)
async def create_oximeter_reading(
    payload: OximeterReadingCreate,
    db: AsyncSession = Depends(get_db),
):
    person = await person_crud.get_by_id(db, payload.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    existing = await oximeter_crud.recently_saved(
        db, payload.person_id, payload.spo2_pct, payload.pulse_bpm
    )
    if existing:
        incoming = payload.waveform or []
        stored = existing.waveform or []
        if incoming and len(incoming) >= len(stored):
            return await oximeter_crud.set_waveform(db, existing, incoming)
        return existing
    return await oximeter_crud.create(db, payload)


router.include_router(protected)


@router.websocket("/ws/oximeter")
async def oximeter_endpoint(
    websocket: WebSocket,
    person_id: UUID | None = None,
    address: str | None = None,
    visit_id: UUID | None = None,
    token: str | None = None,
):
    if not await authenticate_websocket(websocket, token):
        return
    await stream_oximeter(websocket, person_id=person_id, address=address, visit_id=visit_id)
