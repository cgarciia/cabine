from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import String, cast, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.measurement import ScaleMeasurement
from app.schemas.measurement import MeasurementCreate


def _id_key(value: object) -> str:
    return str(value).lower().replace("-", "")


async def create(db: AsyncSession, data: MeasurementCreate) -> ScaleMeasurement:
    record = ScaleMeasurement(
        person_id=data.person_id,
        scale_id=data.scale_id,
        scale_name=data.scale_name,
        adapter=data.adapter,
        peso_kg=data.peso_kg,
        height_cm=data.height_cm,
        age=data.age,
        birth_date=data.birth_date,
        sex=data.sex,
        people_type=data.people_type,
        expected_weight_kg=data.expected_weight_kg,
        estavel=data.estavel,
        completo=data.completo,
        impedancias_ohm=data.impedancias_ohm,
        segmentos=data.segmentos,
        metricas=data.metricas,
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)
    return record


async def list_by_person(db: AsyncSession, person_id: UUID) -> list[ScaleMeasurement]:
    pid = str(person_id)
    result = await db.execute(
        select(ScaleMeasurement)
        .where(cast(ScaleMeasurement.person_id, String) == pid)
        .order_by(ScaleMeasurement.created_at.desc())
    )
    rows = list(result.scalars().all())
    if rows:
        return rows

    result = await db.execute(
        select(ScaleMeasurement).order_by(ScaleMeasurement.created_at.desc())
    )
    needle = _id_key(person_id)
    return [
        record
        for record in result.scalars().all()
        if _id_key(record.person_id) == needle
    ]


async def recently_saved(db: AsyncSession, person_id: UUID, peso_kg: float, seconds: int = 90) -> bool:
    records = await list_by_person(db, person_id)
    if not records:
        return False
    latest = records[0]
    created = latest.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - created > timedelta(seconds=seconds):
        return False
    return abs(float(latest.peso_kg) - peso_kg) < 0.15
