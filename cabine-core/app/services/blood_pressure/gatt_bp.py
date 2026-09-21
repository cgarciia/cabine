from __future__ import annotations

from datetime import datetime
from typing import Any

BP_MEASUREMENT_UUID = "00002a35-0000-1000-8000-00805f9b34fb"
BP_FEATURE_UUID = "00002a49-0000-1000-8000-00805f9b34fb"
LIVE_NOTIFY_UUID = "8858eb40-aee8-11e1-bb67-0002a5d5c51b"


def _sfloat(raw: int) -> float | None:
    if raw in {0x07FF, 0x0800, 0x7FF, 0x800}:
        return None
    mantissa = raw & 0x0FFF
    if mantissa & 0x0800:
        mantissa -= 0x1000
    exponent = (raw >> 12) & 0x0F
    if exponent & 0x08:
        exponent -= 0x10
    return float(mantissa * (10**exponent))


def parse_bp_measurement(payload: bytes) -> dict[str, Any] | None:
    """IEEE 11073 Blood Pressure Measurement (0x2A35)."""
    if len(payload) < 7:
        return None
    flags = payload[0]
    units_kpa = bool(flags & 0x01)
    has_timestamp = bool(flags & 0x02)
    has_pulse = bool(flags & 0x04)
    has_user = bool(flags & 0x08)
    has_status = bool(flags & 0x10)

    sys = _sfloat(int.from_bytes(payload[1:3], "little"))
    dia = _sfloat(int.from_bytes(payload[3:5], "little"))
    if sys is None or dia is None:
        return None
    if units_kpa:
        sys *= 7.50062
        dia *= 7.50062

    offset = 7
    measured_at = datetime.now().astimezone()
    if has_timestamp and len(payload) >= offset + 7:
        year = int.from_bytes(payload[offset : offset + 2], "little")
        month = payload[offset + 2]
        day = payload[offset + 3]
        hour = payload[offset + 4]
        minute = payload[offset + 5]
        second = payload[offset + 6]
        try:
            measured_at = datetime(year, month, day, hour, minute, second).astimezone()
        except ValueError:
            pass
        offset += 7

    pulse = None
    if has_pulse and len(payload) >= offset + 2:
        pulse = _sfloat(int.from_bytes(payload[offset : offset + 2], "little"))
        offset += 2
    if has_user and len(payload) >= offset + 1:
        offset += 1

    movement = False
    irregular = False
    if has_status and len(payload) >= offset + 2:
        status = int.from_bytes(payload[offset : offset + 2], "little")
        irregular = bool(status & 0x04)
        movement = bool(status & 0x10)

    return {
        "sys_mmhg": int(round(sys)),
        "dia_mmhg": int(round(dia)),
        "pulse_bpm": int(round(pulse)) if pulse else None,
        "movement": movement,
        "irregular_heartbeat": irregular,
        "measured_at": measured_at,
        "source": "gatt_1810",
    }
