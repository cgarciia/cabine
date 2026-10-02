from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class BleDevice(BaseModel):
    name: str
    address: str
    rssi: int | None = None


class BleScanResponse(BaseModel):
    devices: list[BleDevice]


class DeviceReadingResponseBase(BaseModel):
    """Fields shared by every reading captured from a BLE peripheral."""

    id: UUID
    user_id: UUID
    session_id: UUID
    device_id: UUID | None = None
    device_name: str
    device_address: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
