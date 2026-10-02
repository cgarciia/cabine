from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cabin import Cabin
from app.services import cabin_state

DEFAULT_MODULES = [
    "questionario",
    "bioimpedancia",
    "oximetria",
    "pressao",
    "temperatura",
]
ALREADY_REGISTERED = "Esta cabine já está cadastrada."


async def get_by_machine_id(db: AsyncSession, machine_id: str) -> Cabin | None:
    result = await db.execute(select(Cabin).where(Cabin.machine_id == machine_id))
    return result.scalars().first()


async def get_local(db: AsyncSession) -> Cabin | None:
    """Cabine deste PC, a que o JSON aponta. Sem arquivo, não há cabine local."""
    current_id = cabin_state.cabin_id()
    if current_id is None:
        return None
    return await db.get(Cabin, current_id)


async def _unclaimed(db: AsyncSession) -> list[Cabin]:
    result = await db.execute(
        select(Cabin).where(Cabin.machine_id.is_(None), Cabin.is_active.is_(True)).order_by(Cabin.created_at)
    )
    return list(result.scalars().all())


async def register(db: AsyncSession, description: str) -> Cabin:
    local = await get_local(db)
    if local is not None:
        raise ValueError(ALREADY_REGISTERED)
    machine_id = cabin_state.ensure_machine_id()
    existing = await get_by_machine_id(db, machine_id)
    if existing is not None:
        existing.description = description
        await db.commit()
        await db.refresh(existing)
        cabin_state.remember_cabin(existing.id, machine_id)
        return existing
    unclaimed = await _unclaimed(db)
    if len(unclaimed) == 1:
        cabin = unclaimed[0]
        cabin.machine_id = machine_id
        cabin.description = description
    else:
        cabin = Cabin(
            description=description,
            is_active=True,
            modules=list(DEFAULT_MODULES),
            machine_id=machine_id,
        )
        db.add(cabin)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raced = await get_by_machine_id(db, machine_id)
        if raced is None:
            raise
        cabin_state.remember_cabin(raced.id, machine_id)
        return raced
    await db.refresh(cabin)
    cabin_state.remember_cabin(cabin.id, machine_id)
    return cabin


async def rename(db: AsyncSession, description: str) -> Cabin:
    cabin = await get_local(db)
    if cabin is None:
        raise ValueError("Esta cabine ainda não foi cadastrada.")
    cabin.description = description
    await db.commit()
    await db.refresh(cabin)
    return cabin
