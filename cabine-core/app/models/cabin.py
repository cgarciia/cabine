from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Cabin(Base):
    __tablename__ = "cabins"

    description: Mapped[str] = mapped_column(String(160), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    modules: Mapped[list] = mapped_column(JSONB, nullable=False)

    devices = relationship("Device", back_populates="cabin")
    sessions = relationship("Session", back_populates="cabin")
