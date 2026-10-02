from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import base
from app.crud import device as device_crud
from app.crud import session as session_crud
from app.models.blood_pressure_reading import BloodPressureReading
from app.schemas.blood_pressure import BloodPressureReadingCreate


async def create(
    db: AsyncSession,
    data: BloodPressureReadingCreate,
    *,
    slug: str,
) -> BloodPressureReading:
    session_id = await session_crud.attach_session(db, data.user_id, data.session_id)
    device = await device_crud.resolve_for_reading(db, slug, data.device_id, data.device_address)
    payload = data.model_dump(exclude={"device_slug"})
    payload.update(
        {
            "session_id": session_id,
            "device_id": device.id,
            "device_address": device.address,
            "device_name": data.device_name or device.description,
        }
    )
    return await base.save(db, BloodPressureReading(**payload))


async def list_by_user(db: AsyncSession, user_id: UUID) -> list[BloodPressureReading]:
    return await base.list_by_user(
        db, BloodPressureReading, user_id, order_by=BloodPressureReading.measured_at
    )


async def get_by_measurement(
    db: AsyncSession,
    user_id: UUID,
    measured_at: datetime,
    sys_mmhg: int,
    dia_mmhg: int,
    pulse_bpm: int,
) -> BloodPressureReading | None:
    result = await db.execute(
        select(BloodPressureReading)
        .where(
            BloodPressureReading.user_id == user_id,
            BloodPressureReading.measured_at == measured_at,
            BloodPressureReading.sys_mmhg == sys_mmhg,
            BloodPressureReading.dia_mmhg == dia_mmhg,
            BloodPressureReading.pulse_bpm == pulse_bpm,
        )
        .limit(1)
    )
    return result.scalar_one_or_none()
