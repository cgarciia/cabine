from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import load_scoped_user, require_access
from app.crud import form_submission as form_crud
from app.models.admin import Admin
from app.models.user import User
from app.schemas.form_submission import FormSubmissionCreate, FormSubmissionResponse

router = APIRouter(prefix="/forms", tags=["Forms"])


@router.post("", response_model=FormSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_form(
    payload: FormSubmissionCreate,
    db: AsyncSession = Depends(get_db),
    actor: User | Admin = Depends(require_access),
):
    await load_scoped_user(db, actor, payload.user_id)
    try:
        return await form_crud.create(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
