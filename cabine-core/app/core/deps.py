from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from fastapi import Depends, HTTPException, WebSocket, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.crud import person as person_crud
from app.crud import user as user_crud
from app.models.person import ScalePerson
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login/registration")
oauth2_optional = OAuth2PasswordBearer(tokenUrl="login/registration", auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Sessão inválida ou expirada.",
    headers={"WWW-Authenticate": "Bearer"},
)
_UNAUTHORIZED_KIOSK = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Sessão inválida ou expirada. Entre com a matrícula novamente.",
    headers={"WWW-Authenticate": "Bearer"},
)
_UNAUTHORIZED_OPERATOR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Sessão de operador inválida ou expirada.",
    headers={"WWW-Authenticate": "Bearer"},
)
_FORBIDDEN_PERSON = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Esta sessão não pode acessar dados de outra pessoa.",
)


@dataclass(frozen=True)
class AccessPrincipal:
    kind: Literal["person", "user"]
    person_id: UUID | None = None

    def bound_person_id(self, requested: UUID | None) -> UUID | None:
        if self.kind == "person":
            return self.person_id
        return requested

    @property
    def person_locked(self) -> bool:
        return self.kind == "person"


def _decode_payload(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    if not isinstance(payload, dict):
        return None
    return payload


async def resolve_person_from_token(token: str, db: AsyncSession) -> ScalePerson | None:
    payload = _decode_payload(token)
    if payload is None:
        return None
    if payload.get("typ") != "person":
        return None
    sub = payload.get("sub")
    if not isinstance(sub, str):
        return None
    try:
        person_id = UUID(sub)
    except ValueError:
        return None
    return await person_crud.get_by_id(db, person_id)


async def resolve_user_from_token(token: str, db: AsyncSession) -> User | None:
    payload = _decode_payload(token)
    if payload is None:
        return None
    typ = payload.get("typ")
    email = payload.get("sub")
    if not isinstance(email, str):
        return None
    if typ is not None and typ != "user":
        return None
    user = await user_crud.get_by_email(db, email)
    if user is None or not user.is_active:
        return None
    return user


async def get_current_person(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> ScalePerson:
    person = await resolve_person_from_token(token, db)
    if person is None:
        raise _UNAUTHORIZED_KIOSK
    return person


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await resolve_user_from_token(token, db)
    if user is None:
        raise _UNAUTHORIZED_OPERATOR
    return user


async def require_access(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> ScalePerson | User:
    """Accept a kiosk registration session or a system user."""
    person = await resolve_person_from_token(token, db)
    if person is not None:
        return person
    user = await resolve_user_from_token(token, db)
    if user is not None:
        return user
    raise _UNAUTHORIZED


def ensure_person_scope(actor: ScalePerson | User, person_id: UUID) -> None:
    if isinstance(actor, User):
        return
    if actor.id != person_id:
        raise _FORBIDDEN_PERSON


async def authenticate_websocket(websocket: WebSocket, token: str | None) -> AccessPrincipal | None:
    if not token:
        await websocket.close(code=4401)
        return None
    async with AsyncSessionLocal() as db:
        person = await resolve_person_from_token(token, db)
        if person is not None:
            return AccessPrincipal(kind="person", person_id=person.id)
        user = await resolve_user_from_token(token, db)
        if user is not None:
            return AccessPrincipal(kind="user")
    await websocket.close(code=4401)
    return None
