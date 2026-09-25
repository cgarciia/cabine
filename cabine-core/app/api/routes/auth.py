from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import check_login_rate_limit, record_login_failure
from app.core.security import issue_operator_token, issue_person_token, verify_password
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


def _registration_key(raw: str) -> str:
    key = raw.strip()
    if not key:
        raise HTTPException(status_code=400, detail="Informe a matrícula.")
    return key


@router.post("/login/lookup", response_model=RegistrationLookupResponse)
async def lookup_registration(
    payload: RegistrationLookup,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    check_login_rate_limit(request, "lookup")
    key = _registration_key(payload.registration)
    person = await person_crud.get_by_registration(db, key)
    exists = bool(person and person.registration)
    if not exists:
        record_login_failure(request, "lookup")
    return RegistrationLookupResponse(exists=exists)


@router.post("/login/registration", response_model=RegistrationSessionResponse)
async def login_by_registration(
    payload: RegistrationLogin,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    key = _registration_key(payload.registration)
    check_login_rate_limit(request, "registration", key)
    person = await person_crud.get_by_registration(db, key)
    if (
        not person
        or not person.registration
        or person.birth_date is None
        or person.birth_date != payload.birth_date
    ):
        record_login_failure(request, "registration", key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Matrícula ou data de nascimento incorretas.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = issue_person_token(person.id, person.registration)
    return RegistrationSessionResponse(
        **token.model_dump(),
        person=PersonResponse.model_validate(person),
    )


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """Operator login (e-mail). The kiosk uses POST /login/registration."""
    check_login_rate_limit(request, "operator", form_data.username)
    user = await user_crud.get_by_email(db, form_data.username)
    password_ok = verify_password(form_data.password, user.hashed_password if user else None)
    if not user or not user.is_active or not password_ok:
        record_login_failure(request, "operator", form_data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return issue_operator_token(user.email)
