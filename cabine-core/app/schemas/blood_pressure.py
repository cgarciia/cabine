from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BloodPressureDevice(BaseModel):
    name: str
    address: str
    rssi: int | None = None


class BloodPressureScanResponse(BaseModel):
    devices: list[BloodPressureDevice]


class BloodPressureReadingCreate(BaseModel):
    person_id: UUID
    device_name: str = Field(min_length=1, max_length=120)
    device_address: str | None = Field(default=None, max_length=40)
    sys_mmhg: int = Field(ge=60, le=260)
    dia_mmhg: int = Field(ge=40, le=215)
    pulse_bpm: int = Field(ge=30, le=240)
    movement: bool = False
    irregular_heartbeat: bool = False
    measured_at: datetime
    visit_id: UUID | None = None


class BloodPressureReadingResponse(BaseModel):
    id: UUID
    person_id: UUID
    device_name: str
    device_address: str | None
    sys_mmhg: int
    dia_mmhg: int
    pulse_bpm: int
    movement: bool
    irregular_heartbeat: bool
    measured_at: datetime
    visit_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
