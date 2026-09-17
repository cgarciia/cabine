from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    waveform: list[int] | None = Field(default=None, max_length=480)
    visit_id: UUID | None = None

    @field_validator("waveform")
    @classmethod
    def clip_waveform(cls, value: list[int] | None) -> list[int] | None:
        if not value:
            return None
        cleaned = [int(item) for item in value[-480:] if -128 <= int(item) <= 255]
        return cleaned or None


class OximeterReadingResponse(BaseModel):
    id: UUID
    person_id: UUID
    device_name: str
    device_address: str | None
    spo2_pct: int
    pulse_bpm: int
    pi_pct: float | None
    stable: bool
    waveform: list[int] | None = None
    visit_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
