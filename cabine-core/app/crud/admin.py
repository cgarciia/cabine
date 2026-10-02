from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models.admin import Admin
from app.schemas.admin import AdminCreate


async def get_by_email(db: AsyncSession, email: str) -> Admin | None:
    result = await db.execute(select(Admin).where(Admin.email == email))
    return result.scalars().first()


async def count_all(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(Admin))
    return int(result.scalar_one())


async def create(db: AsyncSession, user_in: AdminCreate) -> Admin:
    record = Admin(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record
