from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from fastapi import Depends, HTTPException, WebSocket, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal, get_db
from app.crud import admin as admin_crud
from app.crud import user as user_crud
from app.models.admin import Admin
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")
oauth2_optional = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Sessão inválida ou expirada.",
    headers={"WWW-Authenticate": "Bearer"},
)
_UNAUTHORIZED_OPERATOR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Sessão de operador inválida ou expirada.",
    headers={"WWW-Authenticate": "Bearer"},
)
_FORBIDDEN_USER = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Esta sessão não pode acessar dados de outro usuário.",
)
_USER_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="Usuário não encontrado.",
)


@dataclass(frozen=True)
class AccessPrincipal:
    kind: Literal["person", "user"]
    user_id: UUID | None = None

    def bound_user_id(self, requested: UUID | None) -> UUID | None:
        if self.kind == "person":
            return self.user_id
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


async def resolve_person_from_token(token: str, db: AsyncSession) -> User | None:
    payload = _decode_payload(token)
    if payload is None or payload.get("typ") != "person":
        return None
    sub = payload.get("sub")
    if not isinstance(sub, str):
        return None
    try:
        user_id = UUID(sub)
    except ValueError:
        return None
    return await user_crud.get_by_id(db, user_id)


async def resolve_user_from_token(token: str, db: AsyncSession) -> Admin | None:
    payload = _decode_payload(token)
    if payload is None or payload.get("typ") != "user":
        return None
    email = payload.get("sub")
    if not isinstance(email, str):
        return None
    admin = await admin_crud.get_by_email(db, email)
    if admin is None or not admin.is_active:
        return None
    return admin


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Admin:
    admin = await resolve_user_from_token(token, db)
    if admin is None:
        raise _UNAUTHORIZED_OPERATOR
    return admin


async def require_access(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | Admin:
    """Accept a kiosk registration session or an admin."""
    person = await resolve_person_from_token(token, db)
    if person is not None:
        return person
    admin = await resolve_user_from_token(token, db)
    if admin is not None:
        return admin
    raise _UNAUTHORIZED


async def load_scoped_user(
    db: AsyncSession, actor: User | Admin, user_id: UUID
) -> User:
    """Kiosk sessions only reach their own record; admins reach anyone."""
    if isinstance(actor, User) and actor.id != user_id:
        raise _FORBIDDEN_USER
    user = await user_crud.get_by_id(db, user_id)
    if user is None:
        raise _USER_NOT_FOUND
    return user


async def get_scoped_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    actor: User | Admin = Depends(require_access),
) -> User:
    return await load_scoped_user(db, actor, user_id)


async def authenticate_websocket(websocket: WebSocket, token: str | None) -> AccessPrincipal | None:
    if not token:
        await websocket.close(code=4401)
        return None
    async with AsyncSessionLocal() as db:
        person = await resolve_person_from_token(token, db)
        if person is not None:
            return AccessPrincipal(kind="person", user_id=person.id)
        admin = await resolve_user_from_token(token, db)
        if admin is not None:
            return AccessPrincipal(kind="user")
    await websocket.close(code=4401)
    return None
