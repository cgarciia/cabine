from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class BloodPressureReading(Base):
    __tablename__ = "blood_pressure_readings"

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
    device_name: Mapped[str] = mapped_column(String(120), nullable=False)
    device_address: Mapped[str | None] = mapped_column(String(40), nullable=True)
    sys_mmhg: Mapped[int] = mapped_column(Integer, nullable=False)
    dia_mmhg: Mapped[int] = mapped_column(Integer, nullable=False)
    pulse_bpm: Mapped[int] = mapped_column(Integer, nullable=False)
    movement: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    irregular_heartbeat: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    user = relationship("User", back_populates="blood_pressure_readings")
