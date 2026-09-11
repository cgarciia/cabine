from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud import measurement as measurement_crud
from app.crud import person as person_crud
from app.schemas.measurement import MeasurementResponse
from app.schemas.person import PersonCreate, PersonResponse, PersonUpdate

router = APIRouter(prefix="/people", tags=["People"])


@router.get("", response_model=list[PersonResponse])
async def list_people(db: AsyncSession = Depends(get_db)):
    return await person_crud.list_all(db)


@router.post("", response_model=PersonResponse, status_code=status.HTTP_201_CREATED)
async def create_person(payload: PersonCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await person_crud.create(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/matricula/{matricula}", response_model=PersonResponse)
async def get_person_by_matricula(matricula: str, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_matricula(db, matricula)
    if not person:
        raise HTTPException(status_code=404, detail="Matrícula não encontrada.")
    return person


@router.get("/{person_id}/measurements", response_model=list[MeasurementResponse])
async def list_person_measurements(person_id: UUID, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    return await measurement_crud.list_by_person(db, person_id)


@router.patch("/{person_id}", response_model=PersonResponse)
async def update_person(person_id: UUID, payload: PersonUpdate, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    try:
        return await person_crud.update_person(db, person, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_person(person_id: UUID, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    await person_crud.delete_person(db, person)
