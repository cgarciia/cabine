from datetime import date, timedelta
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


class RegistrationLookup(BaseModel):
    registration: str = Field(min_length=1, max_length=40)


class RegistrationLookupResponse(BaseModel):
    exists: bool


class RegistrationLogin(BaseModel):
    registration: str = Field(min_length=1, max_length=40)
    birth_date: date


class RegistrationSessionResponse(Token):
    person: PersonResponse


def _issue_person_token(person_id: UUID, registration: str) -> Token:
    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": str(person_id),
            "typ": "person",
            "registration": registration,
        },
        expires_delta=expires,
    )
    return Token(
        access_token=access_token,
        expires_in=int(expires.total_seconds()),
    )


@router.post("/login/lookup", response_model=RegistrationLookupResponse)
async def lookup_registration(payload: RegistrationLookup, db: AsyncSession = Depends(get_db)):
    key = payload.registration.strip()
    if not key:
        raise HTTPException(status_code=400, detail="Informe a matrícula.")
    person = await person_crud.get_by_registration(db, key)
    return RegistrationLookupResponse(exists=bool(person and person.registration))


@router.post("/login/registration", response_model=RegistrationSessionResponse)
async def login_by_registration(payload: RegistrationLogin, db: AsyncSession = Depends(get_db)):
    key = payload.registration.strip()
    if not key:
        raise HTTPException(status_code=400, detail="Informe a matrícula.")
    person = await person_crud.get_by_registration(db, key)
    if (
        not person
        or not person.registration
        or person.birth_date is None
        or person.birth_date != payload.birth_date
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Matrícula ou data de nascimento incorretas.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = _issue_person_token(person.id, person.registration)
    return RegistrationSessionResponse(
        access_token=token.access_token,
        expires_in=token.expires_in,
        person=PersonResponse.model_validate(person),
    )


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """Operator login (e-mail). The kiosk uses POST /login/registration."""
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
