from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import base
from app.models.blood_pressure_reading import BloodPressureReading
from app.schemas.blood_pressure import BloodPressureReadingCreate


async def create(db: AsyncSession, data: BloodPressureReadingCreate) -> BloodPressureReading:
    return await base.create_from_schema(db, BloodPressureReading, data)


async def list_by_person(db: AsyncSession, person_id: UUID) -> list[BloodPressureReading]:
    return await base.list_by_person(
        db, BloodPressureReading, person_id, order_by=BloodPressureReading.measured_at
    )


async def get_by_measurement(
    db: AsyncSession,
    person_id: UUID,
    measured_at: datetime,
    sys_mmhg: int,
    dia_mmhg: int,
    pulse_bpm: int,
) -> BloodPressureReading | None:
    result = await db.execute(
        select(BloodPressureReading)
        .where(
            BloodPressureReading.person_id == person_id,
            BloodPressureReading.measured_at == measured_at,
            BloodPressureReading.sys_mmhg == sys_mmhg,
            BloodPressureReading.dia_mmhg == dia_mmhg,
            BloodPressureReading.pulse_bpm == pulse_bpm,
        )
        .limit(1)
    )
    return result.scalar_one_or_none()
