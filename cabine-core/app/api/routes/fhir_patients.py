from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.crud import fhir_patient as fhir_patient_crud
from app.models.user import User
from app.services.fhir import dump_fhir_resource, parse_fhir_patient

router = APIRouter(prefix="/fhir/Patient", tags=["FHIR - Patient"])


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_fhir_patient(
    patient_data: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        fhir_patient = parse_fhir_patient(patient_data)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Dados em não conformidade com a especificação FHIR R4: {exc}",
        )

    if not fhir_patient.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O recurso FHIR Patient precisa conter um 'id'.",
        )

    if await fhir_patient_crud.get_by_fhir_id(db, fhir_patient.id):
        raise HTTPException(status_code=400, detail="Paciente com este ID FHIR já cadastrado.")

    record = await fhir_patient_crud.create(
        db,
        fhir_id=fhir_patient.id,
        resource=dump_fhir_resource(fhir_patient),
    )
    return record.resource


@router.get("/{fhir_id}")
async def get_fhir_patient(
    fhir_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    record = await fhir_patient_crud.get_by_fhir_id(db, fhir_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente não encontrado.")
    return record.resource
