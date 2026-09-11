from __future__ import annotations

import logging
from uuid import UUID

from app.core.database import AsyncSessionLocal
from app.crud import oximeter_reading as oximeter_crud
from app.crud import person as person_crud
from app.schemas.oximeter import OximeterReadingCreate

logger = logging.getLogger(__name__)


async def save_oximeter_reading(
    *,
    person_id: UUID,
    device_name: str,
    device_address: str | None,
    spo2_pct: int,
    pulse_bpm: int,
    pi_pct: float | None,
) -> None:
    async with AsyncSessionLocal() as db:
        person = await person_crud.get_by_id(db, person_id)
        if not person:
            logger.warning("Não salvou oximetria: pessoa %s não existe", person_id)
            return
        if await oximeter_crud.recently_saved(db, person_id, spo2_pct, pulse_bpm):
            logger.info(
                "Oximetria ignorada (já existe recente) person=%s spo2=%s pr=%s",
                person_id,
                spo2_pct,
                pulse_bpm,
            )
            return
        record = await oximeter_crud.create(
            db,
            OximeterReadingCreate(
                person_id=person_id,
                device_name=device_name[:120],
                device_address=device_address,
                spo2_pct=spo2_pct,
                pulse_bpm=pulse_bpm,
                pi_pct=pi_pct,
                stable=True,
            ),
        )
        logger.info(
            "Oximetria salva id=%s person=%s spo2=%s pr=%s",
            record.id,
            person_id,
            spo2_pct,
            pulse_bpm,
        )
