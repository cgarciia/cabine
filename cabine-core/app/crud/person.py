from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.person import ScalePerson
from app.schemas.person import PersonCreate, PersonUpdate, _age_from_birth


async def list_all(db: AsyncSession) -> list[ScalePerson]:
    result = await db.execute(select(ScalePerson).order_by(ScalePerson.name))
    return list(result.scalars().all())


async def list_page(
    db: AsyncSession,
    *,
    q: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[ScalePerson], int]:
    filters = []
    if q:
        term = f"%{q.strip()}%"
        if term != "%%":
            filters.append(
                or_(
                    ScalePerson.name.ilike(term),
                    ScalePerson.registration.ilike(term),
                )
            )

    count_stmt = select(func.count()).select_from(ScalePerson)
    if filters:
        count_stmt = count_stmt.where(*filters)
    total = int((await db.execute(count_stmt)).scalar_one())

    stmt = select(ScalePerson).order_by(ScalePerson.name)
    if filters:
        stmt = stmt.where(*filters)
    stmt = stmt.limit(limit).offset(offset)
    rows = list((await db.execute(stmt)).scalars().all())
    return rows, total


async def get_by_id(db: AsyncSession, person_id: UUID) -> ScalePerson | None:
    result = await db.execute(select(ScalePerson).where(ScalePerson.id == person_id))
    return result.scalars().first()


async def get_by_registration(db: AsyncSession, registration: str) -> ScalePerson | None:
    key = registration.strip()
    if not key:
        return None
    result = await db.execute(select(ScalePerson).where(ScalePerson.registration == key))
    return result.scalars().first()


async def create(db: AsyncSession, data: PersonCreate) -> ScalePerson:
    if data.registration:
        existing = await get_by_registration(db, data.registration)
        if existing:
            raise ValueError("Já existe uma pessoa com esta matrícula.")
    person = ScalePerson(
        name=data.name,
        registration=data.registration,
        height_cm=data.height_cm,
        age=int(data.age or 0),
        birth_date=data.birth_date,
        sex=data.sex,
        people_type=data.people_type,
        expected_weight_kg=data.expected_weight_kg,
    )
    db.add(person)
    await db.commit()
    await db.refresh(person)
    return person


async def update_person(db: AsyncSession, person: ScalePerson, data: PersonUpdate) -> ScalePerson:
    if data.name is not None:
        person.name = data.name
    if data.registration is not None:
        if data.registration:
            existing = await get_by_registration(db, data.registration)
            if existing and existing.id != person.id:
                raise ValueError("Já existe uma pessoa com esta matrícula.")
        person.registration = data.registration
    if data.height_cm is not None:
        person.height_cm = data.height_cm
    if data.sex is not None:
        person.sex = data.sex
    if data.people_type is not None:
        person.people_type = data.people_type
    if data.expected_weight_kg is not None:
        person.expected_weight_kg = data.expected_weight_kg
    if data.birth_date is not None:
        person.birth_date = data.birth_date
        person.age = _age_from_birth(data.birth_date)
    elif data.age is not None:
        person.age = data.age
    await db.commit()
    await db.refresh(person)
    return person


async def delete_person(db: AsyncSession, person: ScalePerson) -> None:
    await db.delete(person)
    await db.commit()
