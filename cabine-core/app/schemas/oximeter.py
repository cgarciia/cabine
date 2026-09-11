from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OximeterDevice(BaseModel):
    name: str
    address: str
    rssi: int | None = None


class OximeterScanResponse(BaseModel):
    devices: list[OximeterDevice]


class OximeterReadingCreate(BaseModel):
    person_id: UUID
    device_name: str = Field(min_length=1, max_length=120)
    device_address: str | None = Field(default=None, max_length=40)
    spo2_pct: int = Field(ge=35, le=100)
    pulse_bpm: int = Field(ge=30, le=240)
    pi_pct: float | None = Field(default=None, ge=0, le=30)
    stable: bool = True


class OximeterReadingResponse(BaseModel):
    id: UUID
    person_id: UUID
    device_name: str
    device_address: str | None
    spo2_pct: int
    pulse_bpm: int
    pi_pct: float | None
    stable: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
