from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.oximeter_reading import OximeterReading
from app.schemas.oximeter import OximeterReadingCreate


async def create(db: AsyncSession, data: OximeterReadingCreate) -> OximeterReading:
    record = OximeterReading(
        person_id=data.person_id,
        device_name=data.device_name,
        device_address=data.device_address,
        spo2_pct=data.spo2_pct,
        pulse_bpm=data.pulse_bpm,
        pi_pct=data.pi_pct,
        stable=data.stable,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def list_by_person(db: AsyncSession, person_id: UUID) -> list[OximeterReading]:
    result = await db.execute(
        select(OximeterReading)
        .where(OximeterReading.person_id == person_id)
        .order_by(OximeterReading.created_at.desc())
    )
    return list(result.scalars().all())


async def recently_saved(
    db: AsyncSession,
    person_id: UUID,
    spo2_pct: int,
    pulse_bpm: int,
    *,
    within_seconds: int = 45,
) -> bool:
    cutoff = datetime.now(UTC) - timedelta(seconds=within_seconds)
    result = await db.execute(
        select(OximeterReading.id)
        .where(
            OximeterReading.person_id == person_id,
            OximeterReading.spo2_pct == spo2_pct,
            OximeterReading.pulse_bpm == pulse_bpm,
            OximeterReading.created_at >= cutoff,
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None
