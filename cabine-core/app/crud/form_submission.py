from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import base
from app.crud import session as session_crud
from app.models.form_submission import FormSubmission
from app.schemas.form_submission import FormSubmissionCreate


async def create(db: AsyncSession, data: FormSubmissionCreate) -> FormSubmission:
    session_id = await session_crud.attach_session(db, data.user_id, data.session_id)
    data = data.model_copy(update={"session_id": session_id})
    return await base.create_from_schema(db, FormSubmission, data)


async def list_by_user(db: AsyncSession, user_id: UUID) -> list[FormSubmission]:
    return await base.list_by_user(db, FormSubmission, user_id)
