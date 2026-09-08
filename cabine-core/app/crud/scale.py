from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scale import Scale
from app.schemas.scale import ScaleCreate, ScaleUpdate
from app.services.scale.registry import adapter_accepts_parser, normalize_address
from app.services.scale.spec import ScaleSpec


def to_spec(scale: Scale) -> ScaleSpec:
    return ScaleSpec(
        id=scale.id,
        name=scale.name,
        adapter=scale.adapter,
        address=scale.address,
        parser=scale.parser,
    )


async def list_all(db: AsyncSession) -> list[Scale]:
    result = await db.execute(select(Scale).order_by(Scale.name))
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, scale_id: UUID) -> Scale | None:
    result = await db.execute(select(Scale).where(Scale.id == scale_id))
    return result.scalars().first()


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
    stmt = update(Scale).where(Scale.is_default.is_(True)).values(is_default=False)
    if except_id is not None:
        stmt = update(Scale).where(Scale.id != except_id, Scale.is_default.is_(True)).values(
            is_default=False
        )
    await db.execute(stmt)


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


def _merged_transport(scale: Scale, data: ScaleUpdate) -> tuple[str, str, str]:
    adapter = data.adapter.value if data.adapter else scale.adapter
    parser = data.parser.value if data.parser else scale.parser
    address = data.address if data.address is not None else scale.address
    if not adapter_accepts_parser(adapter, parser):
        raise ValueError(f"Parser '{parser}' não é compatível com o adapter '{adapter}'.")
    return adapter, normalize_address(adapter, address), parser


async def update_scale(db: AsyncSession, scale: Scale, data: ScaleUpdate) -> Scale:
    adapter, address, parser = _merged_transport(scale, data)
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
