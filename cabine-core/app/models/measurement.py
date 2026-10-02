from datetime import date
from uuid import UUID

from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ScaleMeasurement(Base):
    __tablename__ = "scale_measurements"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[UUID] = mapped_column(
        ForeignKey("sessions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    device_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("devices.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    scale_name: Mapped[str] = mapped_column(String(120), nullable=False)
    adapter: Mapped[str] = mapped_column(String(40), nullable=False)
    device_address: Mapped[str | None] = mapped_column(String(120), nullable=True)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    height_cm: Mapped[float] = mapped_column(Float, nullable=False)
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sex: Mapped[str] = mapped_column(String(16), nullable=False)
    people_type: Mapped[str] = mapped_column(String(20), nullable=False)
    expected_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    stable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    complete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    impedances_ohm: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    segments: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    user = relationship("User", back_populates="measurements")
