from datetime import date

from sqlalchemy import Date, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class User(Base):
    """Pessoa que entra no totem com matrícula."""

    __tablename__ = "users"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    registration: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    height_cm: Mapped[float] = mapped_column(Float, nullable=False)
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sex: Mapped[str] = mapped_column(String(16), nullable=False)
    people_type: Mapped[str] = mapped_column(String(20), nullable=False, default="normal")
    expected_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)

    sessions = relationship("Session", back_populates="user")
    measurements = relationship("ScaleMeasurement", back_populates="user")
    forms = relationship("FormSubmission", back_populates="user")
    oximeter_readings = relationship("OximeterReading", back_populates="user")
    blood_pressure_readings = relationship("BloodPressureReading", back_populates="user")
