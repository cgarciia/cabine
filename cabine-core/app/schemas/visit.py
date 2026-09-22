from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.blood_pressure import BloodPressureReadingResponse
from app.schemas.form_submission import FormSubmissionResponse
from app.schemas.measurement import MeasurementResponse
from app.schemas.oximeter import OximeterReadingResponse


class VisitBundleResponse(BaseModel):
    id: str
    visit_id: UUID | None
    at: datetime | str
    measurement: MeasurementResponse | None = None
    oximeter: OximeterReadingResponse | None = None
    blood_pressure: BloodPressureReadingResponse | None = None
    health: FormSubmissionResponse | None = None
    mental: FormSubmissionResponse | None = None


class VisitListResponse(BaseModel):
    items: list[VisitBundleResponse]
    total: int
    limit: int
    offset: int
