from pydantic import BaseModel, ConfigDict, EmailStr
from uuid import UUID


class AdminCreate(BaseModel):
    email: EmailStr
    password: str


class AdminResponse(BaseModel):
    id: UUID
    email: EmailStr
    is_active: bool

    model_config = ConfigDict(from_attributes=True)
