from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import device as device_crud
from app.crud import session as session_crud
from app.models.device import Device
from app.schemas.scale import ScaleCreate, ScaleUpdate

SCALE_SLUG = "scale"


async def list_all(db: AsyncSession) -> list[Device]:
    return await device_crud.list_by_slug(db, SCALE_SLUG)


async def get_by_id(db: AsyncSession, scale_id: UUID) -> Device | None:
    device = await device_crud.get_by_id(db, scale_id)
    if device is None or device.device_type is None or device.device_type.slug != SCALE_SLUG:
        return None
    cabin = await session_crud.get_local_cabin(db)
    if cabin is None or device.cabin_id != cabin.id:
        return None
    return device


async def get_by_address(db: AsyncSession, address: str) -> Device | None:
    device = await device_crud.get_by_address(db, address)
    if device is None or device.device_type is None or device.device_type.slug != SCALE_SLUG:
        return None
    return device


async def get_default(db: AsyncSession) -> Device | None:
    return await device_crud.get_default(db, SCALE_SLUG)


async def create(db: AsyncSession, data: ScaleCreate) -> Device:
    device = await device_crud.save_paired(
        db,
        slug=SCALE_SLUG,
        description=data.name,
        address=data.address,
        adapter=data.adapter.value,
        parser=data.parser.value,
        make_default=data.is_active and (data.is_default or not await list_all(db)),
    )
    if not data.is_active:
        device.is_active = False
        device.is_default = False
        await db.commit()
        await db.refresh(device)
    return device


async def update_scale(
    db: AsyncSession,
    scale: Device,
    data: ScaleUpdate,
    transport: tuple[str, str, str],
) -> Device:
    adapter, address, parser = transport
    if address != scale.address:
        other = await device_crud.get_by_address(db, address)
        if other and other.id != scale.id:
            raise ValueError("Já existe uma balança com este endereço.")
    scale.adapter = adapter
    scale.address = address
    scale.parser = parser
    if data.name is not None:
        scale.description = data.name
    if data.is_active is False:
        scale.is_active = False
        scale.is_default = False
    elif data.is_active is True:
        scale.is_active = True
    if data.is_default is True:
        if scale.cabin_id is None:
            raise ValueError("Aparelho sem cabine não pode ser o padrão.")
        await device_crud.mark_default(db, scale)
        return scale
    if data.is_default is False:
        scale.is_default = False
    await db.commit()
    await db.refresh(scale)
    return scale


async def delete_scale(db: AsyncSession, scale: Device) -> None:
    await device_crud.delete_device(db, scale)
