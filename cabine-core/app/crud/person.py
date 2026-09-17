from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.person import ScalePerson
from app.schemas.person import PersonCreate, PersonUpdate, _age_from_birth


async def list_all(db: AsyncSession) -> list[ScalePerson]:
    result = await db.execute(select(ScalePerson).order_by(ScalePerson.name))
    return list(result.scalars().all())


async def get_by_id(db: AsyncSession, person_id: UUID) -> ScalePerson | None:
    result = await db.execute(select(ScalePerson).where(ScalePerson.id == person_id))
    return result.scalars().first()


async def get_by_matricula(db: AsyncSession, matricula: str) -> ScalePerson | None:
    key = matricula.strip()
    if not key:
        return None
    result = await db.execute(select(ScalePerson).where(ScalePerson.matricula == key))
    return result.scalars().first()


async def create(db: AsyncSession, data: PersonCreate) -> ScalePerson:
    if data.matricula:
        existing = await get_by_matricula(db, data.matricula)
        if existing:
            raise ValueError("Já existe uma pessoa com esta matrícula.")
    person = ScalePerson(
        name=data.name,
        matricula=data.matricula,
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
    if data.matricula is not None:
        if data.matricula:
            existing = await get_by_matricula(db, data.matricula)
            if existing and existing.id != person.id:
                raise ValueError("Já existe uma pessoa com esta matrícula.")
        person.matricula = data.matricula
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
