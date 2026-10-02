from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class DeviceType(Base):
    __tablename__ = "device_types"

    slug: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(160), nullable=False)

    devices = relationship("Device", back_populates="device_type")
