from datetime import date

from sqlalchemy import Date, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ScalePerson(Base):
    __tablename__ = "people"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    matricula: Mapped[str | None] = mapped_column(String(40), nullable=True, unique=True, index=True)
    height_cm: Mapped[float] = mapped_column(Float, nullable=False)
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sex: Mapped[str] = mapped_column(String(16), nullable=False)
    people_type: Mapped[str] = mapped_column(String(20), nullable=False, default="normal")
    expected_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)

    measurements = relationship("ScaleMeasurement", back_populates="person")
