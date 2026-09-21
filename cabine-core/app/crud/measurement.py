from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.measurement import ScaleMeasurement
from app.models.person import ScalePerson
from app.schemas.measurement import MeasurementCreate
from app.services.scale.rm_rd2504a import has_bia_impedances


async def create(db: AsyncSession, data: MeasurementCreate) -> ScaleMeasurement:
    record = ScaleMeasurement(
        person_id=data.person_id,
        scale_id=data.scale_id,
        scale_name=data.scale_name,
        adapter=data.adapter,
        weight_kg=data.weight_kg,
        height_cm=data.height_cm,
        age=data.age,
        birth_date=data.birth_date,
        sex=data.sex,
        people_type=data.people_type,
        expected_weight_kg=data.expected_weight_kg,
        stable=data.stable,
        complete=data.complete,
        impedances_ohm=data.impedances_ohm,
        segments=data.segments,
        metrics=data.metrics,
        visit_id=data.visit_id,
    )
    db.add(record)
    person = await db.get(ScalePerson, data.person_id)
    if person is not None:
        person.expected_weight_kg = data.weight_kg
        person.height_cm = data.height_cm
        person.age = data.age
        person.sex = data.sex
        person.people_type = data.people_type
        if data.birth_date is not None:
            person.birth_date = data.birth_date
    await db.commit()
    await db.refresh(record)
    return record


async def list_by_person(db: AsyncSession, person_id: UUID) -> list[ScaleMeasurement]:
    result = await db.execute(
        select(ScaleMeasurement)
        .where(ScaleMeasurement.person_id == person_id)
        .order_by(ScaleMeasurement.created_at.desc())
    )
    return list(result.scalars().all())


async def recently_saved(
    db: AsyncSession,
    person_id: UUID,
    weight_kg: float,
    seconds: int = 90,
    *,
    incoming_bia: bool = False,
) -> bool:
    result = await db.execute(
        select(ScaleMeasurement)
        .where(ScaleMeasurement.person_id == person_id)
        .order_by(ScaleMeasurement.created_at.desc())
        .limit(1)
    )
    latest = result.scalars().first()
    if latest is None:
        return False
    created = latest.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - created > timedelta(seconds=seconds):
        return False
    if abs(float(latest.weight_kg) - weight_kg) >= 0.15:
        return False
    latest_zs = latest.impedances_ohm if isinstance(latest.impedances_ohm, list) else None
    latest_bia = has_bia_impedances(latest_zs)
    if latest_bia:
        return True
    return not incoming_bia
