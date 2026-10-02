from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import load_scoped_user, require_access
from app.crud import measurement as measurement_crud
from app.models.admin import Admin
from app.models.user import User
from app.schemas.measurement import MeasurementCreate, MeasurementResponse, as_measurement_response
from app.services.scale.measurement import sanitize_measurement

router = APIRouter(prefix="/measurements", tags=["Measurements"])


@router.post("", response_model=MeasurementResponse, status_code=status.HTTP_201_CREATED)
async def create_measurement(
    payload: MeasurementCreate,
    db: AsyncSession = Depends(get_db),
    actor: User | Admin = Depends(require_access),
):
    await load_scoped_user(db, actor, payload.user_id)
    try:
        record = await measurement_crud.create(db, sanitize_measurement(payload, payload.adapter))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return as_measurement_response(record)
