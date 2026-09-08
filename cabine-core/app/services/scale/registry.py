from app.services.scale.adapters.base import ScaleAdapter
from app.services.scale.adapters.ble_broadcast import BleBroadcastAdapter
from app.services.scale.adapters.ble_gatt import BleGattAdapter
from app.services.scale.parsers import PARSER_LABELS, PARSERS
from app.services.scale.spec import ScaleSpec

_ADAPTERS: dict[str, ScaleAdapter] = {
    adapter.key: adapter
    for adapter in (BleGattAdapter(), BleBroadcastAdapter())
}


def get_adapter(key: str) -> ScaleAdapter:
    try:
        return _ADAPTERS[key]
    except KeyError as exc:
        raise ValueError(f"Adapter desconhecido: {key}") from exc


def adapter_accepts_parser(adapter_key: str, parser_key: str) -> bool:
    adapter = get_adapter(adapter_key)
    return parser_key in adapter.parsers and parser_key in PARSERS


def normalize_address(adapter_key: str, address: str) -> str:
    return get_adapter(adapter_key).validate_address(address)


def resolve_parser(spec: ScaleSpec):
    from app.services.scale.parsers import resolve_parser as _resolve

    return _resolve(spec)


def list_catalog() -> list[dict]:
    catalog = []
    for adapter in _ADAPTERS.values():
        catalog.append(
            {
                "key": adapter.key,
                "label": adapter.label,
                "address_kind": adapter.address_kind,
                "address_label": adapter.address_label,
                "parsers": [
                    {"key": parser_key, "label": PARSER_LABELS.get(parser_key, parser_key)}
                    for parser_key in adapter.parsers
                    if parser_key in PARSERS
                ],
            }
        )
    return catalog
