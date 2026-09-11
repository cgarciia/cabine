from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.crud import form_submission as form_crud
from app.crud import person as person_crud
from app.schemas.form_submission import FormSubmissionCreate, FormSubmissionResponse

router = APIRouter(prefix="/forms", tags=["Forms"])


@router.post("", response_model=FormSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_form(payload: FormSubmissionCreate, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_id(db, payload.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    if payload.module not in {"health", "mental"}:
        raise HTTPException(status_code=400, detail="Módulo inválido.")
    return await form_crud.create(db, payload)


@router.get("/person/{person_id}", response_model=list[FormSubmissionResponse])
async def list_forms_for_person(person_id: UUID, db: AsyncSession = Depends(get_db)):
    person = await person_crud.get_by_id(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada.")
    return await form_crud.list_by_person(db, person_id)
