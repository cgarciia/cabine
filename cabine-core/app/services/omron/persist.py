from __future__ import annotations

import logging
from datetime import datetime
from uuid import UUID

from app.core.database import AsyncSessionLocal
from app.crud import blood_pressure_reading as bp_crud
from app.crud import person as person_crud
from app.schemas.blood_pressure import BloodPressureReadingCreate

logger = logging.getLogger(__name__)


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
        person = await person_crud.get_by_id(db, person_id)
        if not person:
            logger.warning("Não salvou pressão: pessoa %s não existe", person_id)
            return
        existing = await bp_crud.get_by_measurement(
            db, person_id, measured_at, sys_mmhg, dia_mmhg, pulse_bpm
        )
        if existing:
            logger.info(
                "Pressão ignorada (já existe) person=%s sys=%s dia=%s at=%s",
                person_id,
                sys_mmhg,
                dia_mmhg,
                measured_at,
            )
            return
        record = await bp_crud.create(
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
        logger.info(
            "Pressão salva id=%s person=%s sys=%s dia=%s pr=%s",
            record.id,
            person_id,
            sys_mmhg,
            dia_mmhg,
            pulse_bpm,
        )
