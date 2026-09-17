from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class FHIRPatient(Base):
    __tablename__ = "fhir_patients"

    fhir_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    resource: Mapped[dict] = mapped_column(JSONB, nullable=False)
