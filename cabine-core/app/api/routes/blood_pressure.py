from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import authenticate_websocket, require_access
from app.crud import blood_pressure_reading as bp_crud
from app.crud import person as person_crud
from app.schemas.blood_pressure import (
    BloodPressureDevice,
    BloodPressureReadingCreate,
    BloodPressureReadingResponse,
    BloodPressureScanResponse,
)
from app.services.ble import ble_radio_lock
from app.services.omron.ble import scan_omron
from app.services.omron.stream import stream_blood_pressure

router = APIRouter(tags=["BloodPressure"])
protected = APIRouter(dependencies=[Depends(require_access)])


@protected.get("/blood-pressures/scan", response_model=BloodPressureScanResponse)
async def scan_nearby_monitors():
    async with ble_radio_lock:
        found = await scan_omron(timeout=10.0)
    devices = [
        BloodPressureDevice(
            name=device.name or "OMRON Complete",
            address=(device.address or "").upper(),
            rssi=getattr(advertisement, "rssi", None) if advertisement else None,
        )
        for device, advertisement in found
        if device.address
    ]
    return BloodPressureScanResponse(devices=devices)


@protected.get("/blood-pressures", response_model=list[BloodPressureReadingResponse])
async def list_blood_pressure_readings(person_id: UUID, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    return await bp_crud.list_by_person(db, person_id)


@protected.post(
    "/blood-pressures",
    response_model=BloodPressureReadingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_blood_pressure_reading(
    payload: BloodPressureReadingCreate,
    db: AsyncSession = Depends(get_db),
):
    person = await person_crud.get_by_id(db, payload.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    existing = await bp_crud.get_by_measurement(
        db,
        payload.person_id,
        payload.measured_at,
        payload.sys_mmhg,
        payload.dia_mmhg,
        payload.pulse_bpm,
    )
    if existing:
        return existing
    return await bp_crud.create(db, payload)


router.include_router(protected)


@router.websocket("/ws/blood-pressure")
async def blood_pressure_endpoint(
    websocket: WebSocket,
    person_id: UUID | None = None,
    address: str | None = None,
    visit_id: UUID | None = None,
    token: str | None = None,
):
    if not await authenticate_websocket(websocket, token):
        return
    await stream_blood_pressure(websocket, person_id=person_id, address=address, visit_id=visit_id)
