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

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login/matricula")

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Sessão inválida ou expirada. Entre com a matrícula novamente.",
    headers={"WWW-Authenticate": "Bearer"},
)


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
        raise _UNAUTHORIZED
    return person


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await resolve_user_from_token(token, db)
    if user is None:
        raise _UNAUTHORIZED
    return user


async def require_access(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> ScalePerson | User:
    """Aceita sessão de matrícula (kiosk) ou usuário do sistema."""
    person = await resolve_person_from_token(token, db)
    if person is not None:
        return person
    user = await resolve_user_from_token(token, db)
    if user is not None:
        return user
    raise _UNAUTHORIZED


async def authenticate_websocket(websocket: WebSocket, token: str | None) -> bool:
    if not token:
        await websocket.close(code=4401)
        return False
    async with AsyncSessionLocal() as db:
        person = await resolve_person_from_token(token, db)
        if person is not None:
            return True
        user = await resolve_user_from_token(token, db)
        if user is not None:
            return True
    await websocket.close(code=4401)
    return False
