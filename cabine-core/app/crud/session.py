from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cabin import Cabin
from app.models.session import Session


async def get_local_cabin(db: AsyncSession) -> Cabin | None:
    from app.crud import cabin as cabin_crud

    return await cabin_crud.get_local(db)


async def get_open(db: AsyncSession, user_id: UUID) -> Session | None:
    result = await db.execute(
        select(Session).where(Session.user_id == user_id, Session.status == "open")
    )
    return result.scalars().first()


async def abandon_open(db: AsyncSession, user_id: UUID) -> None:
    current = await get_open(db, user_id)
    if current is None:
        return
    current.status = "abandoned"
    current.completed_at = datetime.now(timezone.utc)
    await db.flush()


async def open_session(db: AsyncSession, user_id: UUID) -> Session:
    """Fecha a sessão aberta, se houver, e abre outra na cabine ativa."""
    cabin = await get_local_cabin(db)
    if cabin is None:
        raise ValueError("Cadastre a cabine antes de continuar.")
    await abandon_open(db, user_id)
    row = Session(
        user_id=user_id,
        cabin_id=cabin.id,
        status="open",
        started_at=datetime.now(timezone.utc),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def attach_session(db: AsyncSession, user_id: UUID, session_id: UUID | None) -> UUID:
    """Usa a sessão informada ou a aberta deste usuário. Sem aberta, abre uma."""
    if session_id is not None:
        row = await db.get(Session, session_id)
        if row is None or row.user_id != user_id:
            raise ValueError("Sessão inválida para este usuário.")
        return row.id
    current = await get_open(db, user_id)
    if current is not None:
        return current.id
    cabin = await get_local_cabin(db)
    if cabin is None:
        raise ValueError("Cadastre a cabine antes de continuar.")
    row = Session(
        user_id=user_id,
        cabin_id=cabin.id,
        status="open",
        started_at=datetime.now(timezone.utc),
    )
    db.add(row)
    await db.flush()
    return row.id
