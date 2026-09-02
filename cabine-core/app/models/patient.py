from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class FHIRPatient(Base):
    __tablename__ = "fhir_patients"

    # Identificador primário no padrão FHIR (logical id)
    fhir_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)

    # Armazena todo o recurso Patient em JSON estruturado
    resource: Mapped[dict] = mapped_column(JSONB, nullable=False)