from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.services.scale.metrics import metrics_from_stored


class MeasurementCreate(BaseModel):
    person_id: UUID
    scale_id: UUID | None = None
    scale_name: str = Field(min_length=1, max_length=120)
    adapter: str = Field(min_length=1, max_length=40)
    peso_kg: float = Field(gt=0, le=400)
    height_cm: float = Field(gt=0, le=250)
    age: int = Field(ge=1, le=120)
    birth_date: date | None = None
    sex: str
    people_type: str = "normal"
    expected_weight_kg: float | None = None
    estavel: bool = True
    completo: bool = False
    impedancias_ohm: list[float] | None = None
    segmentos: list[dict] | None = None
    metricas: dict | None = None
    visit_id: UUID | None = None


class MeasurementResponse(BaseModel):
    id: UUID
    person_id: UUID
    scale_id: UUID | None
    scale_name: str
    adapter: str
    peso_kg: float
    height_cm: float
    age: int
    birth_date: date | None
    sex: str
    people_type: str
    expected_weight_kg: float | None
    estavel: bool
    completo: bool
    impedancias_ohm: Any = None
    segmentos: Any = None
    metricas: Any = None
    visit_id: UUID | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


def as_measurement_response(record: Any) -> MeasurementResponse:
    payload = MeasurementResponse.model_validate(record)
    refreshed = metrics_from_stored(
        peso_kg=record.peso_kg,
        height_cm=record.height_cm,
        age=record.age,
        sex=record.sex,
        people_type=record.people_type,
        impedancias_ohm=record.impedancias_ohm,
        segmentos=record.segmentos,
        stored_metrics=record.metricas if isinstance(record.metricas, dict) else None,
    )
    if refreshed is None or refreshed is record.metricas:
        return payload
    return payload.model_copy(update={"metricas": refreshed})
