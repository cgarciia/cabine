from __future__ import annotations

import logging
import math
from uuid import UUID

from app.core.database import AsyncSessionLocal
from app.crud import measurement as measurement_crud
from app.crud import person as person_crud
from app.schemas.measurement import MeasurementCreate
from app.services.scale.rm_rd2504a import has_bia_impedances

logger = logging.getLogger(__name__)


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


async def save_from_scale_event(
    *,
    person_id: UUID,
    scale_id: UUID | None,
    payload: dict,
    visit_id: UUID | None = None,
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
        logger.warning("Skipped measurement save: incomplete profile person=%s", person_id)
        return

    data = MeasurementCreate(
        person_id=person_id,
        scale_id=scale_id,
        scale_name=str(payload.get("scale_name") or "Scale")[:120],
        adapter=str(payload.get("adapter") or "ble_rm_rd2504a")[:40],
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
        visit_id=visit_id,
    )

    async with AsyncSessionLocal() as db:
        person = await person_crud.get_by_id(db, person_id)
        if not person:
            logger.warning("Skipped measurement save: person %s does not exist", person_id)
            return
        incoming_zs = data.impedances_ohm if isinstance(data.impedances_ohm, list) else None
        incoming_bia = has_bia_impedances(incoming_zs)
        if await measurement_crud.recently_saved(
            db, person_id, weight_kg, incoming_bia=incoming_bia,
        ):
            logger.info("Skipped duplicate measurement person=%s weight=%.2f", person_id, weight_kg)
            return
        record = await measurement_crud.create(db, data)
        person.expected_weight_kg = data.weight_kg
        await db.commit()
        logger.info("Saved measurement id=%s person=%s weight=%.2f", record.id, person_id, weight_kg)
