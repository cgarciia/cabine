from __future__ import annotations

import logging

from bleak import BleakClient
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData

from app.schemas.ble import BleDevice
from app.services.ble.connect import connect_with_fallback
from app.services.ble.scanner import advertised_name, as_ble_devices, scan_devices, wait_for_device

logger = logging.getLogger(__name__)

DEVICE_LABEL = "HEM-7530T"
WAITING_MESSAGE = "Pareado. Coloque o manguito, toque nos sensores e meça — o totem espera sozinho."

# Strings the peripheral firmware puts on the radio (local name / BLESmart).
# They are match keys for scan, not product names in our domain.
NAME_HINTS = (
    "hem-7530",
    "hem7530",
    "blesmart",
    "complete",
    "omron",
)
BLE_COMPANY_ID = 0x020E
SERVICE_NEEDLES = (
    "ecbe3980-c9a2-11e1-b1bd-0002a5d5c51b",
    "ecbe3980",
)
PAIRING_KEY = bytes.fromhex("deadbeaf12341234deadbeaf12341234")


def name_looks_like_hem7530(name: str | None) -> bool:
    if not name:
        return False
    lowered = name.lower().replace(" ", "")
    return any(hint.replace("-", "") in lowered.replace("-", "") for hint in NAME_HINTS)


def advertisement_looks_like_hem7530(
    advertisement: AdvertisementData | None,
    name: str | None,
) -> bool:
    if name_looks_like_hem7530(name):
        return True
    if advertisement is None:
        return False
    if BLE_COMPANY_ID in (advertisement.manufacturer_data or {}):
        return True
    for uuid in advertisement.service_uuids or []:
        text = str(uuid).lower()
        if any(needle in text for needle in SERVICE_NEEDLES):
            return True
    return False


def _matches(device: BLEDevice, advertisement: AdvertisementData) -> bool:
    return advertisement_looks_like_hem7530(advertisement, advertised_name(device, advertisement))


async def scan_hem7530(timeout: float = 12.0) -> list[BleDevice]:
    return as_ble_devices(await scan_devices(_matches, timeout), DEVICE_LABEL)


async def wait_for_hem7530(
    preferred_address: str | None = None,
    *,
    cancelled,
    on_waiting=None,
) -> BLEDevice | None:
    """With a known MAC, only that monitor is accepted."""
    return await wait_for_device(
        _matches,
        preferred_address,
        cancelled=cancelled,
        label=DEVICE_LABEL,
        on_waiting=on_waiting,
        waiting_message=WAITING_MESSAGE,
        poll_seconds=4.0,
        repeat_waiting=False,
        preferred_only=True,
    )


async def connect_hem7530(device: BLEDevice | str) -> BleakClient:
    return await connect_with_fallback(device, label=DEVICE_LABEL, timeout=20.0, pair=True)
