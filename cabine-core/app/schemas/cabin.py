from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CabinName(BaseModel):
    description: str = Field(min_length=1, max_length=160)

    @field_validator("description")
    @classmethod
    def strip_description(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Informe o nome da cabine.")
        return stripped


class CabinResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    description: str
    is_active: bool
    modules: list
