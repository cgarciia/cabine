from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FormSubmissionCreate(BaseModel):
    user_id: UUID
    session_id: UUID | None = None
    module: Literal["health", "mental"]
    status: str = Field(default="completed", max_length=24)
    payload: dict[str, Any]


class FormSubmissionResponse(BaseModel):
    id: UUID
    user_id: UUID
    session_id: UUID
    module: str
    status: str
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
