from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import load_scoped_person, require_access
from app.crud import measurement as measurement_crud
from app.crud import scale as scale_crud
from app.models.person import ScalePerson
from app.models.user import User
from app.schemas.measurement import MeasurementCreate, MeasurementResponse, as_measurement_response
from app.services.scale.measurement import sanitize_measurement

router = APIRouter(prefix="/measurements", tags=["Measurements"])


@router.post("", response_model=MeasurementResponse, status_code=status.HTTP_201_CREATED)
async def create_measurement(
    payload: MeasurementCreate,
    db: AsyncSession = Depends(get_db),
    actor: ScalePerson | User = Depends(require_access),
):
    await load_scoped_person(db, actor, payload.person_id)
    scale = None
    if payload.scale_id is not None:
        scale = await scale_crud.get_by_id(db, payload.scale_id)
        if not scale:
            raise HTTPException(status_code=404, detail="Balança não encontrada.")
    record = await measurement_crud.create(db, sanitize_measurement(payload, scale))
    return as_measurement_response(record)
