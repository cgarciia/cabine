from __future__ import annotations

import logging
import math
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.crud import measurement as measurement_crud
from app.crud import user as user_crud
from app.schemas.measurement import MeasurementCreate
from app.services.scale.rm_rd2504a import has_bia_impedances

logger = logging.getLogger(__name__)

DUPLICATE_WINDOW_SECONDS = 90
DUPLICATE_WEIGHT_DELTA_KG = 0.15


def jsonable(value):
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if hasattr(value, "item"):
        try:
            return jsonable(value.item())
        except Exception:
            return None
    return value


def _impedances(value) -> list | None:
    return value if isinstance(value, list) else None


async def _is_recent_duplicate(
    db: AsyncSession, data: MeasurementCreate, *, seconds: int = DUPLICATE_WINDOW_SECONDS
) -> bool:
    """Same weight within the window is a repeat, unless it now brings BIA the previous one lacked."""
    latest = await measurement_crud.latest_since(db, data.user_id, seconds)
    if latest is None or abs(float(latest.weight_kg) - data.weight_kg) >= DUPLICATE_WEIGHT_DELTA_KG:
        return False
    if has_bia_impedances(_impedances(latest.impedances_ohm)):
        return True
    return not has_bia_impedances(_impedances(data.impedances_ohm))


async def save_from_scale_event(
    *,
    user_id: UUID,
    device_id: UUID | None,
    payload: dict,
    session_id: UUID | None = None,
) -> None:
    raw_weight = payload.get("weight_kg")
    try:
        weight_kg = float(raw_weight)
    except (TypeError, ValueError):
        return
    if weight_kg < 10:
        return

    profile = payload.get("profile") or {}
    height = float(profile.get("height_cm") or 0)
    age = int(profile.get("age") or 0)
    sex = str(profile.get("sex") or "")
    if height <= 0 or age <= 0 or not sex:
        logger.warning("Skipped measurement save: incomplete profile user=%s", user_id)
        return

    data = MeasurementCreate(
        user_id=user_id,
        device_id=device_id,
        scale_name=str(payload.get("scale_name") or "Scale")[:120],
        adapter=str(payload.get("adapter") or "ble_rm_rd2504a")[:40],
        device_address=payload.get("device_address"),
        weight_kg=weight_kg,
        height_cm=height,
        age=age,
        birth_date=profile.get("birth_date") or None,
        sex=sex,
        people_type=str(profile.get("people_type") or "normal"),
        expected_weight_kg=weight_kg,
        stable=bool(payload.get("stable", True)),
        complete=bool(payload.get("complete")),
        impedances_ohm=jsonable(payload.get("impedances_ohm")),
        segments=jsonable(payload.get("segments")),
        metrics=jsonable(payload.get("metrics")),
        session_id=session_id,
    )

    async with AsyncSessionLocal() as db:
        user = await user_crud.get_by_id(db, user_id)
        if not user:
            logger.warning("Skipped measurement save: user %s does not exist", user_id)
            return
        if await _is_recent_duplicate(db, data):
            logger.info("Skipped duplicate measurement user=%s weight=%.2f", user_id, weight_kg)
            return
        try:
            record = await measurement_crud.create(db, data)
        except ValueError as exc:
            logger.warning("Skipped measurement save: %s", exc)
            return
        logger.info("Saved measurement id=%s user=%s weight=%.2f", record.id, user_id, weight_kg)
