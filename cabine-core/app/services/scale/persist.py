from __future__ import annotations

import logging
import math
from uuid import UUID

from app.core.database import AsyncSessionLocal
from app.crud import measurement as measurement_crud
from app.crud import person as person_crud
from app.schemas.measurement import MeasurementCreate

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
) -> None:
    peso = payload.get("peso_kg")
    try:
        peso_kg = float(peso)
    except (TypeError, ValueError):
        return
    if peso_kg < 10:
        return

    profile = payload.get("perfil") or {}
    height = float(profile.get("altura_cm") or 0)
    age = int(profile.get("idade") or 0)
    sex = str(profile.get("sexo") or "")
    if height <= 0 or age <= 0 or not sex:
        logger.warning("Não salvou medição: perfil incompleto person=%s", person_id)
        return

    data = MeasurementCreate(
        person_id=person_id,
        scale_id=scale_id,
        scale_name=str(payload.get("balanca_nome") or "Balança")[:120],
        adapter=str(payload.get("adapter") or "ble_icomon")[:40],
        peso_kg=peso_kg,
        height_cm=height,
        age=age,
        birth_date=profile.get("nascimento") or None,
        sex=sex,
        people_type=str(profile.get("tipo") or "normal"),
        expected_weight_kg=peso_kg,
        estavel=bool(payload.get("estavel", True)),
        completo=bool(payload.get("completo")),
        impedancias_ohm=jsonable(payload.get("impedancias_ohm")),
        segmentos=jsonable(payload.get("segmentos")),
        metricas=jsonable(payload.get("metricas")),
    )

    async with AsyncSessionLocal() as db:
        person = await person_crud.get_by_id(db, person_id)
        if not person:
            logger.warning("Não salvou medição: pessoa %s não existe", person_id)
            return
        if await measurement_crud.recently_saved(db, person_id, peso_kg):
            logger.info("Medição ignorada (já existe recente) person=%s peso=%.2f", person_id, peso_kg)
            return
        record = await measurement_crud.create(db, data)
        person.expected_weight_kg = data.peso_kg
        await db.commit()
        logger.info("Medição salva id=%s person=%s peso=%.2f", record.id, person_id, peso_kg)
