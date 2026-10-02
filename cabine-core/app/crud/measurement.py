from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import base
from app.crud import device as device_crud
from app.crud import session as session_crud
from app.models.measurement import ScaleMeasurement
from app.models.user import User
from app.schemas.measurement import MeasurementCreate


async def create(db: AsyncSession, data: MeasurementCreate) -> ScaleMeasurement:
    """Persist the weighing and copy the profile used for it back onto the user."""
    session_id = await session_crud.attach_session(db, data.user_id, data.session_id)
    device = await device_crud.resolve_for_reading(db, "scale", data.device_id, data.device_address)
    data = data.model_copy(
        update={
            "session_id": session_id,
            "device_id": device.id,
            "device_address": device.address,
            "adapter": data.adapter or device.adapter,
            "scale_name": data.scale_name or device.description,
        }
    )
    record = ScaleMeasurement(**data.model_dump())
    user = await db.get(User, data.user_id)
    if user is not None:
        user.expected_weight_kg = data.weight_kg
        user.height_cm = data.height_cm
        user.age = data.age
        user.sex = data.sex
        user.people_type = data.people_type
        if data.birth_date is not None:
            user.birth_date = data.birth_date
    return await base.save(db, record)


async def list_by_user(db: AsyncSession, user_id: UUID) -> list[ScaleMeasurement]:
    return await base.list_by_user(db, ScaleMeasurement, user_id)


async def latest_since(
    db: AsyncSession, user_id: UUID, seconds: int
) -> ScaleMeasurement | None:
    result = await db.execute(
        select(ScaleMeasurement)
        .where(ScaleMeasurement.user_id == user_id)
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
