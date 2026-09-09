from collections.abc import Callable

from app.services.scale.icomon import parser_icomon_ffb2
from app.services.scale.spec import ScaleSpec

ParserFn = Callable[..., float | None]


def parser_gatt_16bit_overflow(data: bytearray) -> float | None:
    """Decodifica pacotes GATT com overflow de 16 bits (chips Yolanda / AC27)."""
    hex_data = data.hex()
    if len(hex_data) < 40 or not hex_data.startswith("ac27"):
        return None

    raw_adc = int(hex_data[8:12], 16)
    if raw_adc == 0:
        return 0.0

    peso_kg = raw_adc / 1000.0
    flag_byte = int(hex_data[6:8], 16)

    if flag_byte > 0x50 or peso_kg < 50.0:
        if 10.0 < peso_kg < 50.0:
            peso_kg += 65.536

    return round(peso_kg, 2)


def parser_broadcast_big_endian(manufacturer_data: dict) -> float | None:
    """Decodifica advertising BLE: peso nos 2 primeiros bytes big-endian."""
    for _company, dados in manufacturer_data.items():
        dados_balanca = dados[:-6]
        if len(dados_balanca) >= 2:
            peso_raw = int.from_bytes(dados_balanca[0:2], byteorder="big")
            return round(peso_raw / 100.0, 2)
    return None


PARSERS: dict[str, ParserFn] = {
    "gatt_16bit_overflow": parser_gatt_16bit_overflow,
    "broadcast_big_endian": parser_broadcast_big_endian,
    "icomon_ffb2": parser_icomon_ffb2,
}

PARSER_LABELS: dict[str, str] = {
    "gatt_16bit_overflow": "Yolanda / AC27 (GATT 16-bit overflow)",
    "broadcast_big_endian": "Advertising BLE (2 bytes big-endian / 100)",
    "icomon_ffb2": "ICOMON / RelaxFit (FFB2 peso 3 bytes / 1000)",
}


def resolve_parser(spec: ScaleSpec) -> ParserFn:
    try:
        return PARSERS[spec.parser]
    except KeyError as exc:
        raise ValueError(f"Parser desconhecido: {spec.parser}") from exc
