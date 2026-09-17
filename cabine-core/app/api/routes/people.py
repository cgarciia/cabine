from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_access
from app.crud import form_submission as form_crud
from app.crud import measurement as measurement_crud
from app.crud import oximeter_reading as oximeter_crud
from app.crud import person as person_crud
from app.schemas.form_submission import FormSubmissionResponse
from app.schemas.measurement import MeasurementResponse, as_measurement_response
from app.schemas.oximeter import OximeterReadingResponse
from app.schemas.person import PersonCreate, PersonResponse, PersonUpdate

router = APIRouter(prefix="/people", tags=["People"])
_auth = Depends(require_access)


@router.post("", response_model=PersonResponse, status_code=status.HTTP_201_CREATED)
async def create_person(payload: PersonCreate, db: AsyncSession = Depends(get_db)):
    """Primeiro acesso do totem: cadastro sem sessão prévia."""
    if not payload.matricula:
        raise HTTPException(status_code=400, detail="Matrícula é obrigatória.")
    try:
        return await person_crud.create(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("", response_model=list[PersonResponse], dependencies=[_auth])
async def list_people(db: AsyncSession = Depends(get_db)):
    return await person_crud.list_all(db)


@router.get("/matricula/{matricula}", response_model=PersonResponse, dependencies=[_auth])
async def get_person_by_matricula(matricula: str, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_matricula(db, matricula)
    if not person:
        raise HTTPException(status_code=404, detail="Matrícula não encontrada.")
    return person


@router.get("/{person_id}/forms", response_model=list[FormSubmissionResponse], dependencies=[_auth])
async def list_person_forms(person_id: UUID, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    return await form_crud.list_by_person(db, person_id)


@router.get("/{person_id}/measurements", response_model=list[MeasurementResponse], dependencies=[_auth])
async def list_person_measurements(person_id: UUID, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    return [as_measurement_response(item) for item in await measurement_crud.list_by_person(db, person_id)]


@router.get("/{person_id}/oximeter", response_model=list[OximeterReadingResponse], dependencies=[_auth])
async def list_person_oximeter(person_id: UUID, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    return await oximeter_crud.list_by_person(db, person_id)


@router.patch("/{person_id}", response_model=PersonResponse, dependencies=[_auth])
async def update_person(person_id: UUID, payload: PersonUpdate, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    try:
        return await person_crud.update_person(db, person, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_auth])
async def delete_person(person_id: UUID, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    await person_crud.delete_person(db, person)
