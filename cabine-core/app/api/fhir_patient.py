from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fhir.resources.patient import Patient
import json

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.patient import FHIRPatient
from app.models.user import User

router = APIRouter(prefix="/fhir/Patient", tags=["FHIR - Patient"])

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_fhir_patient(
    patient_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Recebe um recurso Patient no padrão FHIR R4, valida via Pydantic e salva no PostgreSQL.
    """
    try:
        # Validação estrutural rigorosa do padrão HL7 FHIR
        fhir_patient = Patient.parse_obj(patient_data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Dados em não conformidade com a especificação FHIR R4: {str(e)}"
        )

    if not fhir_patient.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O recurso FHIR Patient precisa conter um 'id'."
        )

    # Verifica se o fhir_id já existe
    query = select(FHIRPatient).where(FHIRPatient.fhir_id == fhir_patient.id)
    exists = (await db.execute(query)).scalars().first()
    if exists:
        raise HTTPException(status_code=400, detail="Paciente com este ID FHIR já cadastrado.")

    # Converte o modelo validado em dicionário puro serializável
    resource_dict = json.loads(fhir_patient.json())

    db_record = FHIRPatient(fhir_id=fhir_patient.id, resource=resource_dict)
    db.add(db_record)
    await db.commit()
    await db.refresh(db_record)

    return db_record.resource

@router.get("/{fhir_id}")
async def get_fhir_patient(
    fhir_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Recupera um recurso Patient por seu ID lógico FHIR.
    """
    query = select(FHIRPatient).where(FHIRPatient.fhir_id == fhir_id)
    record = (await db.execute(query)).scalars().first()

    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente não encontrado.")

    return record.resource