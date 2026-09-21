from dataclasses import dataclass, field


@dataclass
class SegmentImpedance:
    name: str
    side: str
    freq_khz: int
    ohm: float


@dataclass
class ScaleReading:
    weight_kg: float
    stable: bool = False
    complete: bool = False
    impedances_ohm: list[float] = field(default_factory=list)
    segments: list[SegmentImpedance] = field(default_factory=list)
    source: str = "stream"
    step: str | None = None
