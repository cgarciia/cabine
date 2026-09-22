from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import (
    ensure_can_mutate_person,
    ensure_person_scope,
    get_current_user,
    oauth2_optional,
    require_access,
    require_operator,
    resolve_user_from_token,
)
from app.crud import form_submission as form_crud
from app.crud import measurement as measurement_crud
from app.crud import blood_pressure_reading as bp_crud
from app.crud import oximeter_reading as oximeter_crud
from app.crud import person as person_crud
from app.models.person import ScalePerson
from app.models.user import User
from app.schemas.form_submission import FormSubmissionResponse
from app.schemas.measurement import MeasurementResponse, as_measurement_response
from app.schemas.blood_pressure import BloodPressureReadingResponse
from app.schemas.oximeter import OximeterReadingResponse
from app.schemas.person import PersonCreate, PersonListResponse, PersonResponse, PersonUpdate
from app.schemas.visit import VisitBundleResponse, VisitListResponse
from app.services.visits import group_saved_visits

router = APIRouter(prefix="/people", tags=["People"])


@router.post("", response_model=PersonResponse, status_code=status.HTTP_201_CREATED)
async def create_person(
    payload: PersonCreate,
    db: AsyncSession = Depends(get_db),
    token: str | None = Depends(oauth2_optional),
):
    """Kiosk first access is public when matrícula is present. Operators may omit it."""
    user = await resolve_user_from_token(token, db) if token else None
    if user is not None:
        ensure_can_mutate_person(user)
    if not payload.registration and (user is None or not user.is_operator):
        raise HTTPException(status_code=400, detail="Matrícula é obrigatória.")
    try:
        return await person_crud.create(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("", response_model=PersonListResponse)
async def list_people(
    q: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    items, total = await person_crud.list_page(db, q=q, limit=limit, offset=offset)
    return PersonListResponse(
        items=[PersonResponse.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/registration/{registration}", response_model=PersonResponse)
async def get_person_by_registration(
    registration: str,
    db: AsyncSession = Depends(get_db),
    actor: ScalePerson | User = Depends(require_access),
):
    if isinstance(actor, ScalePerson) and actor.registration != registration:
        raise HTTPException(status_code=404, detail="Matrícula não encontrada.")
    person = await person_crud.get_by_registration(db, registration)
    if not person:
        raise HTTPException(status_code=404, detail="Matrícula não encontrada.")
    return person


@router.get("/{person_id}/forms", response_model=list[FormSubmissionResponse])
async def list_person_forms(
    person_id: UUID,
    db: AsyncSession = Depends(get_db),
    actor: ScalePerson | User = Depends(require_access),
):
    ensure_person_scope(actor, person_id)
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    return await form_crud.list_by_person(db, person_id)


@router.get("/{person_id}/measurements", response_model=list[MeasurementResponse])
async def list_person_measurements(
    person_id: UUID,
    db: AsyncSession = Depends(get_db),
    actor: ScalePerson | User = Depends(require_access),
):
    ensure_person_scope(actor, person_id)
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    return [as_measurement_response(item) for item in await measurement_crud.list_by_person(db, person_id)]


@router.get("/{person_id}/oximeter", response_model=list[OximeterReadingResponse])
async def list_person_oximeter(
    person_id: UUID,
    db: AsyncSession = Depends(get_db),
    actor: ScalePerson | User = Depends(require_access),
):
    ensure_person_scope(actor, person_id)
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    return await oximeter_crud.list_by_person(db, person_id)


@router.get("/{person_id}/blood-pressure", response_model=list[BloodPressureReadingResponse])
async def list_person_blood_pressure(
    person_id: UUID,
    db: AsyncSession = Depends(get_db),
    actor: ScalePerson | User = Depends(require_access),
):
    ensure_person_scope(actor, person_id)
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    return await bp_crud.list_by_person(db, person_id)


@router.get("/{person_id}/visits", response_model=VisitListResponse)
async def list_person_visits(
    person_id: UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    actor: ScalePerson | User = Depends(require_access),
):
    ensure_person_scope(actor, person_id)
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")

    visits = group_saved_visits(
        await measurement_crud.list_by_person(db, person_id),
        await form_crud.list_by_person(db, person_id),
        await oximeter_crud.list_by_person(db, person_id),
        await bp_crud.list_by_person(db, person_id),
    )
    total = len(visits)
    page = visits[offset : offset + limit]
    return VisitListResponse(
        items=[
            VisitBundleResponse(
                id=item.id,
                visit_id=item.visit_id,
                at=item.at,
                measurement=item.measurement,
                oximeter=item.oximeter,
                blood_pressure=item.blood_pressure,
                health=item.health,
                mental=item.mental,
            )
            for item in page
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{person_id}", response_model=PersonResponse)
async def get_person(
    person_id: UUID,
    db: AsyncSession = Depends(get_db),
    actor: ScalePerson | User = Depends(require_access),
):
    ensure_person_scope(actor, person_id)
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    return person


@router.patch("/{person_id}", response_model=PersonResponse)
async def update_person(
    person_id: UUID,
    payload: PersonUpdate,
    db: AsyncSession = Depends(get_db),
    actor: ScalePerson | User = Depends(require_access),
):
    ensure_person_scope(actor, person_id)
    ensure_can_mutate_person(actor)
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    try:
        return await person_crud.update_person(db, person, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_person(
    person_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_operator),
):
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    await person_crud.delete_person(db, person)
