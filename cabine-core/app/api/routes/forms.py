from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import load_scoped_person, require_access
from app.crud import form_submission as form_crud
from app.models.person import ScalePerson
from app.models.user import User
from app.schemas.form_submission import FormSubmissionCreate, FormSubmissionResponse

router = APIRouter(prefix="/forms", tags=["Forms"])


@router.post("", response_model=FormSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_form(
    payload: FormSubmissionCreate,
    db: AsyncSession = Depends(get_db),
    actor: ScalePerson | User = Depends(require_access),
):
    await load_scoped_person(db, actor, payload.person_id)
    return await form_crud.create(db, payload)
