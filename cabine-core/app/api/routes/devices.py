from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.crud import paired_device as paired_crud
from app.crud import scale as scale_crud
from app.models.scale import Scale
from app.schemas.devices import (
    DeviceInventoryResponse,
    DevicePairRequest,
    DeviceScanRequest,
    DeviceScanResult,
    PairedDeviceResponse,
    ScalePairResponse,
)
from app.services.devices.pairing import PairingError, pair_kind, scan_kind

router = APIRouter(tags=["Devices"], dependencies=[Depends(get_current_user)])


def _scale_view(scale: Scale | None) -> ScalePairResponse | None:
    if scale is None:
        return None
    return ScalePairResponse(id=scale.id, name=scale.name, address=scale.address)


@router.get("/devices", response_model=DeviceInventoryResponse)
async def list_devices(db: AsyncSession = Depends(get_db)):
    rows = await paired_crud.list_all(db)
    scale = await scale_crud.get_default(db)
    return DeviceInventoryResponse(
        devices=[PairedDeviceResponse.model_validate(row) for row in rows],
        scale=_scale_view(scale),
    )


@router.post("/devices/scan", response_model=DeviceScanResult)
async def scan_devices_for_kind(payload: DeviceScanRequest):
    try:
        devices = await scan_kind(payload.kind)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="A varredura Bluetooth falhou. Confira se o rádio está ligado.") from exc
    return DeviceScanResult(kind=payload.kind, devices=devices)


@router.post("/devices/pair", response_model=DeviceInventoryResponse)
async def pair_device(payload: DevicePairRequest, db: AsyncSession = Depends(get_db)):
    try:
        await pair_kind(db, payload.kind, payload.address, payload.name)
    except PairingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    rows = await paired_crud.list_all(db)
    scale = await scale_crud.get_default(db)
    return DeviceInventoryResponse(
        devices=[PairedDeviceResponse.model_validate(row) for row in rows],
        scale=_scale_view(scale),
    )
