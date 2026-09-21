from __future__ import annotations

from datetime import datetime
from typing import Any


USER_START_ADDRESS = 0x2E8
RECORDS_PER_USER = 90
RECORD_BYTE_SIZE = 0x0E
TRANSMISSION_BLOCK_SIZE = 0x10


def _bits_to_int(payload: bytes, first_bit: int, last_bit: int) -> int:
    value = int.from_bytes(payload, "big")
    width = last_bit - first_bit + 1
    shifted = value >> (len(payload) * 8 - (last_bit + 1))
    return shifted & ((1 << width) - 1)


def parse_hem7530_record(payload: bytes) -> dict[str, Any] | None:
    if len(payload) < RECORD_BYTE_SIZE:
        return None
    if payload == b"\xff" * RECORD_BYTE_SIZE:
        return None
    dia = _bits_to_int(payload, 0, 7)
    sys = _bits_to_int(payload, 8, 15) + 25
    year = _bits_to_int(payload, 18, 23) + 2000
    bpm = _bits_to_int(payload, 24, 31)
    movement = _bits_to_int(payload, 32, 32)
    ihb = _bits_to_int(payload, 33, 33)
    month = _bits_to_int(payload, 34, 37)
    day = _bits_to_int(payload, 38, 42)
    hour = _bits_to_int(payload, 43, 47)
    minute = _bits_to_int(payload, 52, 57)
    second = min(_bits_to_int(payload, 58, 63), 59)
    try:
        measured_at = datetime(year, month, day, hour, minute, second)
    except ValueError:
        return None
    return {
        "sys_mmhg": sys,
        "dia_mmhg": dia,
        "pulse_bpm": bpm,
        "movement": bool(movement),
        "irregular_heartbeat": bool(ihb),
        "measured_at": measured_at,
        "raw_hex": payload.hex(),
    }


def pick_latest_record(records: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not records:
        return None
    dated = [item for item in records if item["measured_at"].year >= 2020]
    pool = dated or records
    return max(pool, key=lambda item: item["measured_at"])
