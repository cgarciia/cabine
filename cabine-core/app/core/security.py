from datetime import datetime, timedelta, timezone
from uuid import UUID

import bcrypt
from jose import jwt

from app.core.config import settings
from app.schemas.token import Token

# Compared when the e-mail does not exist so both branches cost one bcrypt check.
_DUMMY_HASH = bcrypt.hashpw(b"cabine-timing-guard", bcrypt.gensalt()).decode("utf-8")


def get_password_hash(password: str) -> str:
    pwd_bytes = password.encode("utf-8")
    hashed = bcrypt.hashpw(pwd_bytes, bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        (hashed_password or _DUMMY_HASH).encode("utf-8"),
    ) and hashed_password is not None


def _issue_token(claims: dict, minutes: int) -> Token:
    expires = timedelta(minutes=minutes)
    to_encode = {**claims, "exp": datetime.now(timezone.utc) + expires}
    return Token(
        access_token=jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM),
        expires_in=int(expires.total_seconds()),
    )


def issue_person_token(person_id: UUID, registration: str) -> Token:
    return _issue_token(
        {"sub": str(person_id), "typ": "person", "registration": registration},
        settings.PERSON_TOKEN_EXPIRE_MINUTES,
    )


def issue_operator_token(email: str) -> Token:
    return _issue_token({"sub": email, "typ": "user"}, settings.OPERATOR_TOKEN_EXPIRE_MINUTES)
