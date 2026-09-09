from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.services.scale.registry import adapter_accepts_parser, list_catalog, normalize_address


class ScaleAdapter(StrEnum):
    ble_gatt = "ble_gatt"
    ble_broadcast = "ble_broadcast"
    ble_icomon = "ble_icomon"


class ScaleParser(StrEnum):
    gatt_16bit_overflow = "gatt_16bit_overflow"
    broadcast_big_endian = "broadcast_big_endian"
    icomon_ffb2 = "icomon_ffb2"


class ScaleBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    adapter: ScaleAdapter
    address: str = Field(min_length=1, max_length=120)
    parser: ScaleParser
    is_active: bool = True
    is_default: bool = False

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Nome é obrigatório.")
        return stripped

    @model_validator(mode="after")
    def validate_adapter_parser_address(self):
        if not adapter_accepts_parser(self.adapter.value, self.parser.value):
            raise ValueError(
                f"Parser '{self.parser.value}' não é compatível com o adapter '{self.adapter.value}'."
            )
        try:
            self.address = normalize_address(self.adapter.value, self.address)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
        return self


class ScaleCreate(ScaleBase):
    pass


class ScaleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    adapter: ScaleAdapter | None = None
    address: str | None = Field(default=None, min_length=1, max_length=120)
    parser: ScaleParser | None = None
    is_active: bool | None = None
    is_default: bool | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("Nome é obrigatório.")
        return stripped


class ScaleResponse(BaseModel):
    id: UUID
    name: str
    adapter: str
    address: str
    parser: str
    is_active: bool
    is_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ScaleCatalogResponse(BaseModel):
    adapters: list[dict]


def catalog_payload() -> ScaleCatalogResponse:
    return ScaleCatalogResponse(adapters=list_catalog())
