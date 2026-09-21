from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import ensure_person_scope, require_access
from app.crud import measurement as measurement_crud
from app.crud import person as person_crud
from app.crud import scale as scale_crud
from app.models.person import ScalePerson
from app.models.user import User
from app.schemas.measurement import MeasurementCreate, MeasurementResponse, as_measurement_response

router = APIRouter(prefix="/measurements", tags=["Measurements"])


@router.get("", response_model=list[MeasurementResponse])
async def list_measurements(
    person_id: UUID,
    db: AsyncSession = Depends(get_db),
    actor: ScalePerson | User = Depends(require_access),
):
    ensure_person_scope(actor, person_id)
    return [as_measurement_response(item) for item in await measurement_crud.list_by_person(db, person_id)]


@router.get("/person/{person_id}", response_model=list[MeasurementResponse])
async def list_measurements_for_person(
    person_id: UUID,
    db: AsyncSession = Depends(get_db),
    actor: ScalePerson | User = Depends(require_access),
):
    ensure_person_scope(actor, person_id)
    return [as_measurement_response(item) for item in await measurement_crud.list_by_person(db, person_id)]


@router.post("", response_model=MeasurementResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=MeasurementResponse, status_code=status.HTTP_201_CREATED)
async def create_measurement(
    payload: MeasurementCreate,
    db: AsyncSession = Depends(get_db),
    actor: ScalePerson | User = Depends(require_access),
):
    ensure_person_scope(actor, payload.person_id)
    person = await person_crud.get_by_id(db, payload.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")

    scale = None
    if payload.scale_id is not None:
        scale = await scale_crud.get_by_id(db, payload.scale_id)
        if not scale:
            raise HTTPException(status_code=404, detail="Balança não encontrada.")

    adapter = (scale.adapter if scale else payload.adapter) or ""
    supports_bia = adapter == "ble_rm_rd2504a" or bool(payload.impedances_ohm)
    stored = payload
    if not supports_bia:
        metrics = None
        if payload.metrics:
            metrics = {
                key: value
                for key, value in payload.metrics.items()
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
            "impedances_ohm": None,
            "segments": None,
            "metrics": metrics,
        })

    record = await measurement_crud.create(db, stored)
    return as_measurement_response(record)
