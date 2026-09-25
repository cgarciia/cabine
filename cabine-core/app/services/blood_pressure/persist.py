from __future__ import annotations

import logging
from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.crud import blood_pressure_reading as bp_crud
from app.crud import person as person_crud
from app.models.blood_pressure_reading import BloodPressureReading
from app.schemas.blood_pressure import BloodPressureReadingCreate

logger = logging.getLogger(__name__)


async def store_blood_pressure_reading(
    db: AsyncSession, data: BloodPressureReadingCreate
) -> BloodPressureReading:
    """Insert, or return the identical reading already stored for that timestamp."""
    existing = await bp_crud.get_by_measurement(
        db, data.person_id, data.measured_at, data.sys_mmhg, data.dia_mmhg, data.pulse_bpm
    )
    if existing is not None:
        logger.info(
            "Skipped duplicate blood pressure person=%s sys=%s dia=%s at=%s",
            data.person_id, data.sys_mmhg, data.dia_mmhg, data.measured_at,
        )
        return existing
    record = await bp_crud.create(db, data)
    logger.info(
        "Saved blood pressure id=%s person=%s sys=%s dia=%s pr=%s",
        record.id, data.person_id, data.sys_mmhg, data.dia_mmhg, data.pulse_bpm,
    )
    return record


async def save_blood_pressure_reading(
    *,
    person_id: UUID,
    device_name: str,
    device_address: str | None,
    sys_mmhg: int,
    dia_mmhg: int,
    pulse_bpm: int,
    movement: bool,
    irregular_heartbeat: bool,
    measured_at: datetime,
    visit_id: UUID | None = None,
) -> None:
    async with AsyncSessionLocal() as db:
        if not await person_crud.get_by_id(db, person_id):
            logger.warning("Skipped blood pressure save: person %s does not exist", person_id)
            return
        await store_blood_pressure_reading(
            db,
            BloodPressureReadingCreate(
                person_id=person_id,
                device_name=device_name[:120],
                device_address=device_address,
                sys_mmhg=sys_mmhg,
                dia_mmhg=dia_mmhg,
                pulse_bpm=pulse_bpm,
                movement=movement,
                irregular_heartbeat=irregular_heartbeat,
                measured_at=measured_at,
                visit_id=visit_id,
            ),
        )
