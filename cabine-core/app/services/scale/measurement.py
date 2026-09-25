from app.models.scale import Scale
from app.schemas.measurement import MeasurementCreate

BIA_ADAPTER = "ble_rm_rd2504a"

# Metrics that only make sense when the scale measured impedance.
BIA_ONLY_METRICS = frozenset({
    "z_20khz",
    "z_100khz",
    "segmentos",
    "equilibrio",
    "gordura_visceral",
    "musculo_esqueletico_kg",
    "musculo_pct",
    "agua_kg",
    "agua_pct",
    "agua_status",
})


def sanitize_measurement(payload: MeasurementCreate, scale: Scale | None) -> MeasurementCreate:
    """Drop BIA data a weight-only scale cannot have produced."""
    adapter = (scale.adapter if scale else payload.adapter) or ""
    if adapter == BIA_ADAPTER or payload.impedances_ohm:
        return payload
    metrics = None
    if payload.metrics:
        metrics = {key: value for key, value in payload.metrics.items() if key not in BIA_ONLY_METRICS}
    return payload.model_copy(update={"impedances_ohm": None, "segments": None, "metrics": metrics})
