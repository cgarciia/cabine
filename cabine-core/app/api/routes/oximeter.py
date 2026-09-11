from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud import oximeter_reading as oximeter_crud
from app.crud import person as person_crud
from app.schemas.oximeter import OximeterReadingCreate, OximeterReadingResponse, OximeterScanResponse
from app.services.oximeter.ble import scan_oximeters
from app.services.oximeter.debuglog import log_path, tail_text
from app.services.oximeter.stream import stream_oximeter
from app.services.scale.adapters.ble_common import ble_radio_lock

router = APIRouter(tags=["Oximeter"])


@router.get("/oximeters/debug-log", response_class=PlainTextResponse)
async def oximeter_debug_log():
    header = f"arquivo: {log_path()}\n\n"
    return header + tail_text()


@router.get("/oximeters/scan", response_model=OximeterScanResponse)
async def scan_nearby_oximeters():
    async with ble_radio_lock:
        devices = await scan_oximeters(timeout=10.0)
    return OximeterScanResponse(devices=devices)


@router.get("/oximeters", response_model=list[OximeterReadingResponse])
async def list_oximeter_readings(person_id: UUID, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    return await oximeter_crud.list_by_person(db, person_id)


@router.post("/oximeters", response_model=OximeterReadingResponse, status_code=status.HTTP_201_CREATED)
async def create_oximeter_reading(
    payload: OximeterReadingCreate,
    db: AsyncSession = Depends(get_db),
):
    person = await person_crud.get_by_id(db, payload.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    return await oximeter_crud.create(db, payload)


@router.websocket("/ws/oximeter")
async def oximeter_endpoint(
    websocket: WebSocket,
    person_id: UUID | None = None,
    address: str | None = None,
):
    await stream_oximeter(websocket, person_id=person_id, address=address)
