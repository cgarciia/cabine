from dataclasses import dataclass, field


@dataclass
class SegmentImpedance:
    nome: str
    lado: str
    freq_khz: int
    ohm: float


@dataclass
class ScaleReading:
    peso_kg: float
    estavel: bool = False
    completo: bool = False
    impedancias_ohm: list[float] = field(default_factory=list)
    segmentos: list[SegmentImpedance] = field(default_factory=list)
    fonte: str = "stream"
    etapa: str | None = None
