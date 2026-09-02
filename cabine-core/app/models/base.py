import uuid
from datetime import datetime

from sqlalchemy import DateTime, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.sql import func

class Base(DeclarativeBase):
    # Avisa ao SQLAlchemy que esta classe é apenas um "molde"
    # e não deve virar uma tabela no banco de dados.
    __abstract__ = True

    # Chave primária universal usando UUID v4
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True
    )

    # Preenche sozinho com a data/hora do momento em que foi salvo
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    # Atualiza sozinho a data/hora sempre que o registro for modificado
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )