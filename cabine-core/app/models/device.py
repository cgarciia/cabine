from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Device(Base):
    __tablename__ = "devices"
    __table_args__ = (
        Index(
            "uq_devices_one_default_per_type",
            "cabin_id",
            "device_type_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
        CheckConstraint(
            "NOT is_default OR (is_active AND cabin_id IS NOT NULL)",
            name="devices_default_requires_cabin",
        ),
    )

    cabin_id: Mapped[UUID | None] = mapped_column(ForeignKey("cabins.id", ondelete="RESTRICT"), index=True)
    device_type_id: Mapped[UUID] = mapped_column(
        ForeignKey("device_types.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    description: Mapped[str] = mapped_column(String(120), nullable=False)
    address: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    adapter: Mapped[str] = mapped_column(String(40), nullable=False)
    parser: Mapped[str] = mapped_column(String(60), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    paired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    cabin = relationship("Cabin", back_populates="devices")
    device_type = relationship("DeviceType", back_populates="devices")

    @property
    def name(self) -> str:
        return self.description
