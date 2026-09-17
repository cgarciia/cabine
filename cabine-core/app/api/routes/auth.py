from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, verify_password
from app.crud import person as person_crud
from app.crud import user as user_crud
from app.schemas.person import PersonResponse
from app.schemas.token import Token

router = APIRouter(tags=["Auth"])


class MatriculaLogin(BaseModel):
    matricula: str = Field(min_length=1, max_length=40)


class MatriculaSessionResponse(Token):
    person: PersonResponse


def _issue_person_token(person_id: UUID, matricula: str) -> Token:
    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": str(person_id),
            "typ": "person",
            "matricula": matricula,
        },
        expires_delta=expires,
    )
    return Token(
        access_token=access_token,
        expires_in=int(expires.total_seconds()),
    )


@router.post("/login/matricula", response_model=MatriculaSessionResponse)
async def login_matricula(payload: MatriculaLogin, db: AsyncSession = Depends(get_db)):
    key = payload.matricula.strip()
    if not key:
        raise HTTPException(status_code=400, detail="Informe a matrícula.")
    person = await person_crud.get_by_matricula(db, key)
    if not person or not person.matricula:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Matrícula não encontrada.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = _issue_person_token(person.id, person.matricula)
    return MatriculaSessionResponse(
        access_token=token.access_token,
        expires_in=token.expires_in,
        person=PersonResponse.model_validate(person),
    )


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """Login de operador do sistema (e-mail). O kiosk usa POST /login/matricula."""
    user = await user_crud.get_by_email(db, form_data.username)
    if (
        not user
        or not user.is_active
        or not verify_password(form_data.password, user.hashed_password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "typ": "user"},
        expires_delta=expires,
    )
    return Token(
        access_token=access_token,
        expires_in=int(expires.total_seconds()),
    )
