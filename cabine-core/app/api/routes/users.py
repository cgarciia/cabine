from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_scoped_user, oauth2_optional, resolve_user_from_token
from app.crud import blood_pressure_reading as bp_crud
from app.crud import form_submission as form_crud
from app.crud import measurement as measurement_crud
from app.crud import oximeter_reading as oximeter_crud
from app.crud import user as user_crud
from app.models.user import User
from app.schemas.blood_pressure import BloodPressureReadingResponse
from app.schemas.form_submission import FormSubmissionResponse
from app.schemas.measurement import MeasurementResponse, as_measurement_response
from app.schemas.oximeter import OximeterReadingResponse
from app.schemas.user import UserCreate, UserResponse, UserUpdate

router = APIRouter(prefix="/users", tags=["Users"])


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    token: str | None = Depends(oauth2_optional),
):
    """Kiosk first access is public. Registration is required."""
    if token:
        await resolve_user_from_token(token, db)
    try:
        return await user_crud.create(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_user),
):
    return await user_crud.list_all(db)


@router.get("/{user_id}/forms", response_model=list[FormSubmissionResponse])
async def list_user_forms(
    user: User = Depends(get_scoped_user),
    db: AsyncSession = Depends(get_db),
):
    return await form_crud.list_by_user(db, user.id)


@router.get("/{user_id}/measurements", response_model=list[MeasurementResponse])
async def list_user_measurements(
    user: User = Depends(get_scoped_user),
    db: AsyncSession = Depends(get_db),
):
    return [as_measurement_response(item) for item in await measurement_crud.list_by_user(db, user.id)]


@router.get("/{user_id}/oximeter", response_model=list[OximeterReadingResponse])
async def list_user_oximeter(
    user: User = Depends(get_scoped_user),
    db: AsyncSession = Depends(get_db),
):
    return await oximeter_crud.list_by_user(db, user.id)


@router.get("/{user_id}/blood-pressure", response_model=list[BloodPressureReadingResponse])
async def list_user_blood_pressure(
    user: User = Depends(get_scoped_user),
    db: AsyncSession = Depends(get_db),
):
    return await bp_crud.list_by_user(db, user.id)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    payload: UserUpdate,
    user: User = Depends(get_scoped_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await user_crud.update_user(db, user, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_user),
):
    user = await user_crud.get_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    try:
        await user_crud.delete_user(db, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
