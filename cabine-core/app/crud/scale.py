from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scale import Scale
from app.schemas.scale import ScaleCreate, ScaleUpdate


async def list_all(db: AsyncSession) -> list[Scale]:
    result = await db.execute(select(Scale).order_by(Scale.name))
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, scale_id: UUID) -> Scale | None:
    return await db.get(Scale, scale_id)


async def get_by_address(db: AsyncSession, address: str) -> Scale | None:
    result = await db.execute(select(Scale).where(Scale.address == address))
    return result.scalars().first()


async def get_default(db: AsyncSession) -> Scale | None:
    result = await db.execute(
        select(Scale).where(Scale.is_default.is_(True), Scale.is_active.is_(True))
    )
    scale = result.scalars().first()
    if scale:
        return scale
    result = await db.execute(
        select(Scale).where(Scale.is_active.is_(True)).order_by(Scale.created_at)
    )
    return result.scalars().first()


async def _clear_default(db: AsyncSession, except_id: UUID | None = None) -> None:
    stmt = update(Scale).where(Scale.is_default.is_(True))
    if except_id is not None:
        stmt = stmt.where(Scale.id != except_id)
    await db.execute(stmt.values(is_default=False))


async def create(db: AsyncSession, data: ScaleCreate) -> Scale:
    existing = await list_all(db)
    is_default = data.is_default or not existing
    if is_default:
        await _clear_default(db)

    scale = Scale(
        name=data.name,
        adapter=data.adapter.value,
        address=data.address,
        parser=data.parser.value,
        is_active=data.is_active,
        is_default=is_default,
    )
    db.add(scale)
    await db.commit()
    await db.refresh(scale)
    return scale


async def update_scale(
    db: AsyncSession,
    scale: Scale,
    data: ScaleUpdate,
    transport: tuple[str, str, str],
) -> Scale:
    """`transport` is the already-validated (adapter, address, parser) triple."""
    adapter, address, parser = transport
    if address != scale.address:
        other = await get_by_address(db, address)
        if other and other.id != scale.id:
            raise ValueError("Já existe uma balança com este endereço.")

    scale.adapter = adapter
    scale.address = address
    scale.parser = parser
    if data.name is not None:
        scale.name = data.name
    if data.is_active is not None:
        scale.is_active = data.is_active
    if data.is_default is True:
        await _clear_default(db, except_id=scale.id)
        scale.is_default = True
    elif data.is_default is False:
        scale.is_default = False

    await db.commit()
    await db.refresh(scale)
    return scale


async def delete_scale(db: AsyncSession, scale: Scale) -> None:
    was_default = scale.is_default
    await db.delete(scale)
    await db.commit()
    if was_default:
        replacement = await get_default(db)
        if replacement and not replacement.is_default:
            replacement.is_default = True
            await db.commit()
