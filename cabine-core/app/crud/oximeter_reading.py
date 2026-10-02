from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import base
from app.crud import device as device_crud
from app.crud import session as session_crud
from app.models.oximeter_reading import OximeterReading
from app.schemas.oximeter import OximeterReadingCreate


async def create(db: AsyncSession, data: OximeterReadingCreate) -> OximeterReading:
    session_id = await session_crud.attach_session(db, data.user_id, data.session_id)
    device = await device_crud.resolve_for_reading(db, "oximeter", data.device_id, data.device_address)
    data = data.model_copy(
        update={
            "session_id": session_id,
            "device_id": device.id,
            "device_address": device.address,
            "device_name": data.device_name or device.description,
        }
    )
    return await base.create_from_schema(db, OximeterReading, data)


async def list_by_user(db: AsyncSession, user_id: UUID) -> list[OximeterReading]:
    return await base.list_by_user(db, OximeterReading, user_id)


async def recently_saved(
    db: AsyncSession,
    user_id: UUID,
    spo2_pct: int,
    pulse_bpm: int,
    *,
    within_seconds: int = 45,
) -> OximeterReading | None:
    cutoff = datetime.now(UTC) - timedelta(seconds=within_seconds)
    result = await db.execute(
        select(OximeterReading)
        .where(
            OximeterReading.user_id == user_id,
            OximeterReading.spo2_pct == spo2_pct,
            OximeterReading.pulse_bpm == pulse_bpm,
            OximeterReading.created_at >= cutoff,
        )
        .order_by(OximeterReading.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def set_waveform(
    db: AsyncSession,
    record: OximeterReading,
    waveform: list[int] | None,
) -> OximeterReading:
    if waveform:
        record.waveform = waveform
        await db.commit()
        await db.refresh(record)
    return record
