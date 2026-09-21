from collections.abc import Callable

from app.services.scale.rm_rd2504a import parser_rm_rd2504a_ffb2
from app.services.scale.spec import ScaleSpec

ParserFn = Callable[..., float | None]


def parser_gatt_16bit_overflow(data: bytearray) -> float | None:
    """Decode GATT packets with 16-bit overflow (AC27 chip)."""
    hex_data = data.hex()
    if len(hex_data) < 40 or not hex_data.startswith("ac27"):
        return None

    raw_adc = int(hex_data[8:12], 16)
    if raw_adc == 0:
        return 0.0

    weight_kg = raw_adc / 1000.0
    flag_byte = int(hex_data[6:8], 16)

    if flag_byte > 0x50 or weight_kg < 50.0:
        if 10.0 < weight_kg < 50.0:
            weight_kg += 65.536

    return round(weight_kg, 2)


def parser_broadcast_big_endian(manufacturer_data: dict) -> float | None:
    """Decode BLE advertising: weight in the first 2 bytes big-endian."""
    for _company, payload in manufacturer_data.items():
        body = payload[:-6]
        if len(body) >= 2:
            raw = int.from_bytes(body[0:2], byteorder="big")
            return round(raw / 100.0, 2)
    return None


PARSERS: dict[str, ParserFn] = {
    "gatt_16bit_overflow": parser_gatt_16bit_overflow,
    "broadcast_big_endian": parser_broadcast_big_endian,
    "rm_rd2504a_ffb2": parser_rm_rd2504a_ffb2,
}

PARSER_LABELS: dict[str, str] = {
    "gatt_16bit_overflow": "AC27 (GATT 16-bit overflow)",
    "broadcast_big_endian": "BLE advertising (2 bytes big-endian / 100)",
    "rm_rd2504a_ffb2": "RM-RD2504A (FFB2 weight 3 bytes / 1000)",
}


def resolve_parser(spec: ScaleSpec) -> ParserFn:
    try:
        return PARSERS[spec.parser]
    except KeyError as exc:
        raise ValueError(f"Parser desconhecido: {spec.parser}") from exc
