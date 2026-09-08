from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class ScaleSpec:
    id: UUID
    name: str
    adapter: str
    address: str
    parser: str
