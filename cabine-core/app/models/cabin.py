from sqlalchemy import Boolean, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Cabin(Base):
    __tablename__ = "cabins"
    __table_args__ = (UniqueConstraint("machine_id", name="uq_cabins_machine_id"),)

    description: Mapped[str] = mapped_column(String(160), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    modules: Mapped[list] = mapped_column(JSONB, nullable=False)
    machine_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    devices = relationship("Device", back_populates="cabin")
    sessions = relationship("Session", back_populates="cabin")
