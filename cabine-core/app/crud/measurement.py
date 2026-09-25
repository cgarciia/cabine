from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import base
from app.models.measurement import ScaleMeasurement
from app.models.person import ScalePerson
from app.schemas.measurement import MeasurementCreate


async def create(db: AsyncSession, data: MeasurementCreate) -> ScaleMeasurement:
    """Persist the weighing and copy the profile used for it back onto the person."""
    record = ScaleMeasurement(**data.model_dump())
    person = await db.get(ScalePerson, data.person_id)
    if person is not None:
        person.expected_weight_kg = data.weight_kg
        person.height_cm = data.height_cm
        person.age = data.age
        person.sex = data.sex
        person.people_type = data.people_type
        if data.birth_date is not None:
            person.birth_date = data.birth_date
    return await base.save(db, record)


async def list_by_person(db: AsyncSession, person_id: UUID) -> list[ScaleMeasurement]:
    return await base.list_by_person(db, ScaleMeasurement, person_id)


async def latest_since(
    db: AsyncSession, person_id: UUID, seconds: int
) -> ScaleMeasurement | None:
    result = await db.execute(
        select(ScaleMeasurement)
        .where(ScaleMeasurement.person_id == person_id)
        .order_by(ScaleMeasurement.created_at.desc())
        .limit(1)
    )
    latest = result.scalars().first()
    if latest is None:
        return None
    created = latest.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - created > timedelta(seconds=seconds):
        return None
    return latest
