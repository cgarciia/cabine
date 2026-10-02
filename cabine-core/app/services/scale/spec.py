from dataclasses import dataclass
from uuid import UUID

from app.models.device import Device


@dataclass(frozen=True)
class ScaleSpec:
    id: UUID
    name: str
    adapter: str
    address: str
    parser: str

    @classmethod
    def from_record(cls, scale: Device) -> "ScaleSpec":
        return cls(
            id=scale.id,
            name=scale.name,
            adapter=scale.adapter,
            address=scale.address,
            parser=scale.parser,
        )
