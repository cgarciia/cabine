from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.form_submission import FormSubmission
from app.schemas.form_submission import FormSubmissionCreate


async def create(db: AsyncSession, data: FormSubmissionCreate) -> FormSubmission:
    record = FormSubmission(
        person_id=data.person_id,
        module=data.module,
        status=data.status,
        payload=data.payload,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def list_by_person(db: AsyncSession, person_id: UUID) -> list[FormSubmission]:
    result = await db.execute(
        select(FormSubmission)
        .where(FormSubmission.person_id == person_id)
        .order_by(FormSubmission.created_at.desc())
    )
    return list(result.scalars().all())
