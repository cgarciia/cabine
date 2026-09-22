from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class ProfessionalRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(min_length=1, max_length=120)
    crm: str = Field(min_length=1, max_length=40)

    @field_validator("full_name", "crm")
    @classmethod
    def strip_required(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Campo obrigatório.")
        return cleaned


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    is_active: bool
    role: str
    full_name: str | None = None
    crm: str | None = None

    model_config = ConfigDict(from_attributes=True)
