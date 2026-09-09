from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _age_from_birth(birth: date) -> int:
    today = date.today()
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


class PersonBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    height_cm: float = Field(gt=0, le=250)
    age: int | None = Field(default=None, ge=1, le=120)
    birth_date: date | None = None
    sex: str
    people_type: str = "normal"
    expected_weight_kg: float | None = Field(default=None, gt=0, le=400)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Nome é obrigatório.")
        return stripped

    @field_validator("sex")
    @classmethod
    def normalize_sex(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized in {"m", "male", "masculino", "h", "homem"}:
            return "male"
        if normalized in {"f", "female", "feminino", "mulher"}:
            return "female"
        raise ValueError("Sexo deve ser masculino ou feminino.")

    @field_validator("people_type")
    @classmethod
    def normalize_type(cls, value: str) -> str:
        ptype = value.strip().lower()
        if ptype in {"athlete", "sportman", "atleta", "fit"}:
            return "athlete"
        return "normal"

    @model_validator(mode="after")
    def resolve_age(self):
        if self.birth_date is not None:
            self.age = _age_from_birth(self.birth_date)
        if self.age is None or self.age <= 0:
            raise ValueError("Informe a data de nascimento ou a idade.")
        return self


class PersonCreate(PersonBase):
    pass


class PersonUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    height_cm: float | None = Field(default=None, gt=0, le=250)
    age: int | None = Field(default=None, ge=1, le=120)
    birth_date: date | None = None
    sex: str | None = None
    people_type: str | None = None
    expected_weight_kg: float | None = Field(default=None, gt=0, le=400)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("Nome é obrigatório.")
        return stripped

    @field_validator("sex")
    @classmethod
    def normalize_sex(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip().lower()
        if normalized in {"m", "male", "masculino", "h", "homem"}:
            return "male"
        if normalized in {"f", "female", "feminino", "mulher"}:
            return "female"
        raise ValueError("Sexo deve ser masculino ou feminino.")

    @field_validator("people_type")
    @classmethod
    def normalize_type(cls, value: str | None) -> str | None:
        if value is None:
            return value
        ptype = value.strip().lower()
        if ptype in {"athlete", "sportman", "atleta", "fit"}:
            return "athlete"
        return "normal"


class PersonResponse(BaseModel):
    id: UUID
    name: str
    height_cm: float
    age: int
    birth_date: date | None
    sex: str
    people_type: str
    expected_weight_kg: float | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
