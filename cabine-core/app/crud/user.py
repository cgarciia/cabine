from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models.user import ROLE_OPERATOR, ROLE_PROFESSIONAL, User
from app.schemas.user import ProfessionalRegister, UserCreate


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalars().first()


async def count_all(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(User))
    return int(result.scalar_one())


async def create(db: AsyncSession, user_in: UserCreate, *, role: str = ROLE_OPERATOR) -> User:
    db_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        role=role,
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user


async def create_professional(db: AsyncSession, data: ProfessionalRegister) -> User:
    db_user = User(
        email=data.email,
        hashed_password=get_password_hash(data.password),
        role=ROLE_PROFESSIONAL,
        full_name=data.full_name.strip(),
        crm=data.crm.strip(),
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user
