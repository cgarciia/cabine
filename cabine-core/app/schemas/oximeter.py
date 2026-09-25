from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.ble import DeviceReadingResponseBase


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


class OximeterReadingResponse(DeviceReadingResponseBase):
    spo2_pct: int
    pulse_bpm: int
    pi_pct: float | None
    stable: bool
    waveform: list[int] | None = None
