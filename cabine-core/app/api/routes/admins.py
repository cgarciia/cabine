from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, oauth2_optional, resolve_user_from_token
from app.crud import admin as admin_crud
from app.models.admin import Admin
from app.schemas.admin import AdminCreate, AdminResponse

router = APIRouter(prefix="/admins", tags=["Admins"])


@router.post("", response_model=AdminResponse, status_code=status.HTTP_201_CREATED)
async def register_admin(
    payload: AdminCreate,
    db: AsyncSession = Depends(get_db),
    token: str | None = Depends(oauth2_optional),
):
    if await admin_crud.count_all(db) > 0:
        operator = await resolve_user_from_token(token, db) if token else None
        if operator is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Apenas um operador autenticado pode cadastrar administradores.",
                headers={"WWW-Authenticate": "Bearer"},
            )
    if await admin_crud.get_by_email(db, payload.email):
        raise HTTPException(status_code=400, detail="Este e-mail já está cadastrado.")
    return await admin_crud.create(db, payload)


@router.get("/me", response_model=AdminResponse)
async def read_admin_me(current_user: Admin = Depends(get_current_user)):
    return current_user
