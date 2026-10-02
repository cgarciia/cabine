from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.crud import session as session_crud
from app.models.device import Device
from app.models.device_type import DeviceType

IN_USE = "Não é possível apagar este aparelho porque já existem leituras."


def _with_type():
    return selectinload(Device.device_type)


async def get_type_by_slug(db: AsyncSession, slug: str) -> DeviceType | None:
    result = await db.execute(select(DeviceType).where(DeviceType.slug == slug))
    return result.scalars().first()


async def list_all(db: AsyncSession) -> list[Device]:
    result = await db.execute(
        select(Device).options(_with_type()).order_by(Device.description)
    )
    return list(result.scalars().all())


async def list_by_slug(db: AsyncSession, slug: str) -> list[Device]:
    result = await db.execute(
        select(Device)
        .join(DeviceType)
        .where(DeviceType.slug == slug)
        .options(_with_type())
        .order_by(Device.description)
    )
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, device_id: UUID) -> Device | None:
    result = await db.execute(
        select(Device).where(Device.id == device_id).options(_with_type())
    )
    return result.scalars().first()


async def get_by_address(db: AsyncSession, address: str) -> Device | None:
    key = address.strip()
    result = await db.execute(
        select(Device).where(func.upper(Device.address) == key.upper()).options(_with_type())
    )
    return result.scalars().first()


async def resolve_for_reading(
    db: AsyncSession,
    slug: str,
    device_id: UUID | None = None,
    address: str | None = None,
) -> Device:
    if device_id is not None:
        device = await get_by_id(db, device_id)
        if device is None:
            raise ValueError("Aparelho não encontrado.")
        return device
    if address and address.strip():
        device = await get_by_address(db, address)
        if device is not None:
            return device
    cabin = await session_crud.get_active_cabin(db)
    device = await get_default(db, slug, cabin.id if cabin else None)
    if device is None:
        raise ValueError("Não há equipamento padrão deste tipo nesta cabine.")
    return device


async def get_default(db: AsyncSession, slug: str, cabin_id: UUID | None = None) -> Device | None:
    stmt = (
        select(Device)
        .join(DeviceType)
        .where(
            DeviceType.slug == slug,
            Device.is_default.is_(True),
            Device.is_active.is_(True),
        )
        .options(_with_type())
    )
    if cabin_id is not None:
        stmt = stmt.where(Device.cabin_id == cabin_id)
    result = await db.execute(stmt)
    device = result.scalars().first()
    if device is not None:
        return device
    fallback = (
        select(Device)
        .join(DeviceType)
        .where(DeviceType.slug == slug, Device.is_active.is_(True))
        .options(_with_type())
        .order_by(Device.created_at)
    )
    if cabin_id is not None:
        fallback = fallback.where(Device.cabin_id == cabin_id)
    result = await db.execute(fallback)
    return result.scalars().first()


async def _clear_default(db: AsyncSession, cabin_id: UUID, device_type_id: UUID, except_id: UUID | None = None) -> None:
    stmt = update(Device).where(
        Device.cabin_id == cabin_id,
        Device.device_type_id == device_type_id,
        Device.is_default.is_(True),
    )
    if except_id is not None:
        stmt = stmt.where(Device.id != except_id)
    await db.execute(stmt.values(is_default=False))


async def mark_default(db: AsyncSession, device: Device) -> Device:
    if device.cabin_id is None or not device.is_active:
        raise ValueError("Só um aparelho ativo, de uma cabine, pode ser o padrão.")
    await _clear_default(db, device.cabin_id, device.device_type_id, except_id=device.id)
    device.is_default = True
    await db.commit()
    await db.refresh(device)
    return device


async def save_paired(
    db: AsyncSession,
    *,
    slug: str,
    description: str,
    address: str,
    adapter: str,
    parser: str,
    make_default: bool,
) -> Device:
    cabin = await session_crud.get_active_cabin(db)
    if cabin is None:
        raise ValueError("Nenhuma cabine ativa.")
    kind = await get_type_by_slug(db, slug)
    if kind is None:
        raise ValueError("Tipo de aparelho desconhecido.")
    existing = await get_by_address(db, address)
    now = datetime.now(timezone.utc)
    if existing is None:
        existing = Device(
            cabin_id=cabin.id,
            device_type_id=kind.id,
            description=description,
            address=address,
            adapter=adapter,
            parser=parser,
            is_active=True,
            is_default=False,
            paired_at=now,
        )
        db.add(existing)
        await db.flush()
    else:
        existing.cabin_id = cabin.id
        existing.device_type_id = kind.id
        existing.description = description
        existing.adapter = adapter
        existing.parser = parser
        existing.is_active = True
        existing.paired_at = now
    if make_default:
        await _clear_default(db, cabin.id, kind.id, except_id=existing.id)
        existing.is_default = True
    await db.commit()
    await db.refresh(existing)
    return existing


async def delete_device(db: AsyncSession, device: Device) -> None:
    was_default = device.is_default
    slug = device.device_type.slug if device.device_type is not None else None
    cabin_id = device.cabin_id
    try:
        await db.delete(device)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ValueError(IN_USE) from exc
    if was_default and slug and cabin_id is not None:
        replacement = await get_default(db, slug, cabin_id)
        if replacement and not replacement.is_default and replacement.is_active:
            replacement.is_default = True
            await db.commit()
