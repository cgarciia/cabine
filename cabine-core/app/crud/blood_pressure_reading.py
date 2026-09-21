from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.blood_pressure_reading import BloodPressureReading
from app.schemas.blood_pressure import BloodPressureReadingCreate


async def create(db: AsyncSession, data: BloodPressureReadingCreate) -> BloodPressureReading:
    record = BloodPressureReading(
        person_id=data.person_id,
        device_name=data.device_name,
        device_address=data.device_address,
        sys_mmhg=data.sys_mmhg,
        dia_mmhg=data.dia_mmhg,
        pulse_bpm=data.pulse_bpm,
        movement=data.movement,
        irregular_heartbeat=data.irregular_heartbeat,
        measured_at=data.measured_at,
        visit_id=data.visit_id,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def list_by_person(db: AsyncSession, person_id: UUID) -> list[BloodPressureReading]:
    result = await db.execute(
        select(BloodPressureReading)
        .where(BloodPressureReading.person_id == person_id)
        .order_by(BloodPressureReading.measured_at.desc())
    )
    return list(result.scalars().all())


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
