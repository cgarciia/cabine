from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.ble import BleDevice


class DeviceKind(StrEnum):
    scale = "scale"
    oximeter = "oximeter"
    blood_pressure_ecg = "blood_pressure_ecg"
    blood_pressure_wrist = "blood_pressure_wrist"


class DeviceScanRequest(BaseModel):
    kind: DeviceKind


class DevicePairRequest(BaseModel):
    kind: DeviceKind
    address: str = Field(min_length=1, max_length=40)
    name: str | None = Field(default=None, max_length=120)


class PairedDeviceResponse(BaseModel):
    id: UUID
    kind: str
    name: str
    address: str
    paired_at: datetime
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class ScalePairResponse(BaseModel):
    id: UUID
    name: str
    address: str


class DeviceInventoryResponse(BaseModel):
    devices: list[PairedDeviceResponse]
    scale: ScalePairResponse | None = None


class DeviceScanResult(BaseModel):
    kind: DeviceKind
    devices: list[BleDevice]
