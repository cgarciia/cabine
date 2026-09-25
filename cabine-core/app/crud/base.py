from typing import Any, TypeVar
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Base

ModelT = TypeVar("ModelT", bound=Base)


async def save(db: AsyncSession, record: ModelT) -> ModelT:
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def create_from_schema(db: AsyncSession, model: type[ModelT], data: BaseModel) -> ModelT:
    return await save(db, model(**data.model_dump()))


async def list_by_person(
    db: AsyncSession,
    model: type[ModelT],
    person_id: UUID,
    order_by: Any | None = None,
) -> list[ModelT]:
    column = order_by if order_by is not None else model.created_at
    result = await db.execute(
        select(model).where(model.person_id == person_id).order_by(column.desc())
    )
    return list(result.scalars().all())
