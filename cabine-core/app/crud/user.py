from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate, age_from_birth

HAS_HISTORY = "Não é possível apagar este usuário porque já existem leituras ou questionários."


async def list_all(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).order_by(User.name))
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, user_id: UUID) -> User | None:
    return await db.get(User, user_id)


async def get_by_registration(db: AsyncSession, registration: str) -> User | None:
    key = registration.strip()
    if not key:
        return None
    result = await db.execute(select(User).where(User.registration == key))
    return result.scalars().first()


async def create(db: AsyncSession, data: UserCreate) -> User:
    existing = await get_by_registration(db, data.registration)
    if existing:
        raise ValueError("Já existe um usuário com esta matrícula.")
    user = User(
        name=data.name,
        registration=data.registration,
        height_cm=data.height_cm,
        age=int(data.age or 0),
        birth_date=data.birth_date,
        sex=data.sex,
        people_type=data.people_type,
        expected_weight_kg=data.expected_weight_kg,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(db: AsyncSession, user: User, data: UserUpdate) -> User:
    if data.name is not None:
        user.name = data.name
    if data.registration is not None:
        existing = await get_by_registration(db, data.registration)
        if existing and existing.id != user.id:
            raise ValueError("Já existe um usuário com esta matrícula.")
        user.registration = data.registration
    if data.height_cm is not None:
        user.height_cm = data.height_cm
    if data.sex is not None:
        user.sex = data.sex
    if data.people_type is not None:
        user.people_type = data.people_type
    if data.expected_weight_kg is not None:
        user.expected_weight_kg = data.expected_weight_kg
    if data.birth_date is not None:
        user.birth_date = data.birth_date
        user.age = age_from_birth(data.birth_date)
    elif data.age is not None:
        user.age = data.age
    await db.commit()
    await db.refresh(user)
    return user


async def delete_user(db: AsyncSession, user: User) -> None:
    try:
        await db.delete(user)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ValueError(HAS_HISTORY) from exc
