from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.patient import FHIRPatient


async def get_by_fhir_id(db: AsyncSession, fhir_id: str) -> FHIRPatient | None:
    result = await db.execute(select(FHIRPatient).where(FHIRPatient.fhir_id == fhir_id))
    return result.scalars().first()


async def create(db: AsyncSession, fhir_id: str, resource: dict) -> FHIRPatient:
    record = FHIRPatient(fhir_id=fhir_id, resource=resource)
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record
