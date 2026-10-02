from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.crud import device as device_crud
from app.models.device import Device
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


def _scale_view(scale: Device | None) -> ScalePairResponse | None:
    if scale is None:
        return None
    return ScalePairResponse(id=scale.id, name=scale.description, address=scale.address)


def _paired_view(device: Device) -> PairedDeviceResponse:
    kind = device.device_type.slug if device.device_type is not None else ""
    return PairedDeviceResponse(
        id=device.id,
        kind=kind,
        name=device.description,
        address=device.address,
        paired_at=device.paired_at,
        is_active=device.is_active,
    )


async def _inventory(db: AsyncSession) -> DeviceInventoryResponse:
    rows = await device_crud.list_all(db)
    peripherals = [row for row in rows if row.device_type is None or row.device_type.slug != "scale"]
    scale = await device_crud.get_default(db, "scale")
    return DeviceInventoryResponse(
        devices=[_paired_view(row) for row in peripherals],
        scale=_scale_view(scale),
    )


@router.get("/devices", response_model=DeviceInventoryResponse)
async def list_devices(db: AsyncSession = Depends(get_db)):
    return await _inventory(db)


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
    return await _inventory(db)
