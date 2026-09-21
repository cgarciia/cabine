from pydantic import BaseModel, ConfigDict, Field


class FHIRPatientWrite(BaseModel):
    """FHIR R4 Patient document. Extra fields are forwarded to fhir.resources."""

    model_config = ConfigDict(extra="allow")
    resourceType: str | None = Field(default=None)
    id: str | None = Field(default=None)
