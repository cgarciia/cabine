from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.paired_device import PairedDevice


async def list_all(db: AsyncSession) -> list[PairedDevice]:
    result = await db.execute(select(PairedDevice).order_by(PairedDevice.kind))
    return list(result.scalars().all())


async def get_active(db: AsyncSession, kind: str) -> PairedDevice | None:
    result = await db.execute(
        select(PairedDevice).where(PairedDevice.kind == kind, PairedDevice.is_active.is_(True))
    )
    return result.scalars().first()


async def upsert(db: AsyncSession, kind: str, name: str, address: str) -> PairedDevice:
    result = await db.execute(select(PairedDevice).where(PairedDevice.kind == kind))
    row = result.scalars().first()
    now = datetime.now(timezone.utc)
    if row is None:
        row = PairedDevice(kind=kind, name=name, address=address, paired_at=now, is_active=True)
        db.add(row)
    else:
        row.name = name
        row.address = address
        row.paired_at = now
        row.is_active = True
    await db.commit()
    await db.refresh(row)
    return row
