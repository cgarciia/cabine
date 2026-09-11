from uuid import UUID

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class FormSubmission(Base):
    __tablename__ = "form_submissions"

    person_id: Mapped[UUID] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="completed")
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)

    person = relationship("ScalePerson", back_populates="forms")
