from datetime import date
from uuid import UUID

from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ScaleMeasurement(Base):
    __tablename__ = "scale_measurements"

    person_id: Mapped[UUID] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scale_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("scales.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    scale_name: Mapped[str] = mapped_column(String(120), nullable=False)
    adapter: Mapped[str] = mapped_column(String(40), nullable=False)
    peso_kg: Mapped[float] = mapped_column(Float, nullable=False)
    height_cm: Mapped[float] = mapped_column(Float, nullable=False)
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sex: Mapped[str] = mapped_column(String(16), nullable=False)
    people_type: Mapped[str] = mapped_column(String(20), nullable=False)
    expected_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    estavel: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    completo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    impedancias_ohm: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    segmentos: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    metricas: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    person = relationship("ScalePerson", back_populates="measurements")
