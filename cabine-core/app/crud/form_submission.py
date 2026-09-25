from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import base
from app.models.form_submission import FormSubmission
from app.schemas.form_submission import FormSubmissionCreate


async def create(db: AsyncSession, data: FormSubmissionCreate) -> FormSubmission:
    return await base.create_from_schema(db, FormSubmission, data)


async def list_by_person(db: AsyncSession, person_id: UUID) -> list[FormSubmission]:
    return await base.list_by_person(db, FormSubmission, person_id)
