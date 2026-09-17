from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_access
from app.crud import measurement as measurement_crud
from app.crud import person as person_crud
from app.crud import scale as scale_crud
from app.schemas.measurement import MeasurementCreate, MeasurementResponse, as_measurement_response

router = APIRouter(prefix="/measurements", tags=["Measurements"], dependencies=[Depends(require_access)])


@router.get("", response_model=list[MeasurementResponse])
async def list_measurements(person_id: UUID, db: AsyncSession = Depends(get_db)):
    return [as_measurement_response(item) for item in await measurement_crud.list_by_person(db, person_id)]


@router.get("/person/{person_id}", response_model=list[MeasurementResponse])
async def list_measurements_for_person(person_id: UUID, db: AsyncSession = Depends(get_db)):
    return [as_measurement_response(item) for item in await measurement_crud.list_by_person(db, person_id)]


@router.post("", response_model=MeasurementResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=MeasurementResponse, status_code=status.HTTP_201_CREATED)
async def create_measurement(payload: MeasurementCreate, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_id(db, payload.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")

    scale = None
    if payload.scale_id is not None:
        scale = await scale_crud.get_by_id(db, payload.scale_id)
        if not scale:
            raise HTTPException(status_code=404, detail="Balança não encontrada.")

    adapter = (scale.adapter if scale else payload.adapter) or ""
    supports_bia = adapter == "ble_icomon" or bool(payload.impedancias_ohm)
    stored = payload
    if not supports_bia:
        metricas = None
        if payload.metricas:
            metricas = {
                key: value
                for key, value in payload.metricas.items()
                if key not in {
                    "z_20khz",
                    "z_100khz",
                    "segmentos",
                    "equilibrio",
                    "gordura_visceral",
                    "musculo_esqueletico_kg",
                    "musculo_pct",
                    "agua_kg",
                    "agua_pct",
                    "agua_status",
                }
            }
        stored = payload.model_copy(update={
            "impedancias_ohm": None,
            "segmentos": None,
            "metricas": metricas,
        })

    record = await measurement_crud.create(db, stored)
    person.expected_weight_kg = stored.peso_kg
    person.height_cm = stored.height_cm
    person.age = stored.age
    person.sex = stored.sex
    person.people_type = stored.people_type
    if stored.birth_date is not None:
        person.birth_date = stored.birth_date
    await db.commit()
    await db.refresh(record)
    return as_measurement_response(record)
