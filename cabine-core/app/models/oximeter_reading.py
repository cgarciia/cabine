from uuid import UUID

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class OximeterReading(Base):
    __tablename__ = "oximeter_readings"

    person_id: Mapped[UUID] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_name: Mapped[str] = mapped_column(String(120), nullable=False)
    device_address: Mapped[str | None] = mapped_column(String(40), nullable=True)
    spo2_pct: Mapped[int] = mapped_column(Integer, nullable=False)
    pulse_bpm: Mapped[int] = mapped_column(Integer, nullable=False)
    pi_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    stable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    person = relationship("ScalePerson", back_populates="oximeter_readings")
