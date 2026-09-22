from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

ROLE_OPERATOR = "operator"
ROLE_PROFESSIONAL = "professional"


class User(Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default=ROLE_OPERATOR)
    full_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    crm: Mapped[str | None] = mapped_column(String(40), nullable=True)

    @property
    def is_operator(self) -> bool:
        return self.role == ROLE_OPERATOR

    @property
    def is_professional(self) -> bool:
        return self.role == ROLE_PROFESSIONAL
