from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.crud import oximeter_reading as oximeter_crud
from app.crud import user as user_crud
from app.models.oximeter_reading import OximeterReading
from app.schemas.oximeter import OximeterReadingCreate

logger = logging.getLogger(__name__)


async def store_oximeter_reading(db: AsyncSession, data: OximeterReadingCreate) -> OximeterReading:
    """Insert, or keep the recent identical reading (upgrading its waveform if the new one is longer)."""
    existing = await oximeter_crud.recently_saved(db, data.user_id, data.spo2_pct, data.pulse_bpm)
    if existing is None:
        record = await oximeter_crud.create(db, data)
        logger.info(
            "Oximetria salva id=%s person=%s spo2=%s pr=%s",
            record.id, data.user_id, data.spo2_pct, data.pulse_bpm,
        )
        return record
    incoming = data.waveform or []
    if incoming and len(incoming) >= len(existing.waveform or []):
        existing = await oximeter_crud.set_waveform(db, existing, incoming)
    logger.info(
        "Oximetria ignorada (já existe recente) person=%s spo2=%s pr=%s",
        data.user_id, data.spo2_pct, data.pulse_bpm,
    )
    return existing


async def save_oximeter_reading(
    *,
    user_id: UUID,
    device_name: str,
    device_address: str | None,
    spo2_pct: int,
    pulse_bpm: int,
    pi_pct: float | None,
    session_id: UUID | None = None,
    waveform: list[int] | None = None,
) -> None:
    async with AsyncSessionLocal() as db:
        if not await user_crud.get_by_id(db, user_id):
            logger.warning("Não salvou oximetria: usuário %s não existe", user_id)
            return
        try:
            await store_oximeter_reading(
                db,
                OximeterReadingCreate(
                    user_id=user_id,
                    device_name=device_name[:120],
                    device_address=device_address,
                    spo2_pct=spo2_pct,
                    pulse_bpm=pulse_bpm,
                    pi_pct=pi_pct,
                    stable=True,
                    session_id=session_id,
                    waveform=waveform,
                ),
            )
        except ValueError as exc:
            logger.warning("Não salvou oximetria: %s", exc)
