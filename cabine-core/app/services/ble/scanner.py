from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

from bleak import BleakClient, BleakScanner
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData

from app.schemas.ble import BleDevice

logger = logging.getLogger(__name__)

DeviceMatcher = Callable[[BLEDevice, AdvertisementData], bool]
StatusCallback = Callable[[str], Awaitable[None]]


def advertised_name(device: BLEDevice, advertisement: AdvertisementData | None) -> str | None:
    return device.name or (advertisement.local_name if advertisement else None)


def rssi_of(advertisement: AdvertisementData | None) -> int | None:
    if advertisement is None:
        return None
    rssi = getattr(advertisement, "rssi", None)
    return int(rssi) if rssi is not None else None


def service_count(client: BleakClient) -> int:
    try:
        return len(list(client.services))
    except Exception:
        return 0


async def scan_devices(
    matcher: DeviceMatcher, timeout: float
) -> list[tuple[BLEDevice, AdvertisementData]]:
    """Passive scan; one entry per MAC, strongest signal first."""
    found: dict[str, tuple[BLEDevice, AdvertisementData]] = {}

    def _on_detect(device: BLEDevice, advertisement: AdvertisementData) -> None:
        address = (device.address or "").upper()
        if address and matcher(device, advertisement):
            found[address] = (device, advertisement)

    scanner = BleakScanner(detection_callback=_on_detect)
    await scanner.start()
    try:
        await asyncio.sleep(timeout)
    finally:
        await scanner.stop()
    return sorted(found.values(), key=lambda item: rssi_of(item[1]) or -999, reverse=True)


def as_ble_devices(
    found: list[tuple[BLEDevice, AdvertisementData]], default_name: str
) -> list[BleDevice]:
    return [
        BleDevice(
            name=advertised_name(device, advertisement) or default_name,
            address=(device.address or "").upper(),
            rssi=rssi_of(advertisement),
        )
        for device, advertisement in found
        if device.address
    ]


async def wait_for_device(
    matcher: DeviceMatcher,
    preferred_address: str | None,
    *,
    cancelled: Callable[[], bool],
    label: str,
    on_waiting: StatusCallback | None = None,
    waiting_message: str = "",
    poll_seconds: float = 3.0,
    repeat_waiting: bool = True,
    preferred_only: bool = False,
) -> BLEDevice | None:
    """Scan until a matching device advertises or `cancelled()` turns true.

    A device with `preferred_address` always matches; with `preferred_only`,
    nothing else does.
    """
    loop = asyncio.get_running_loop()
    found: asyncio.Future[BLEDevice] = loop.create_future()
    preferred = (preferred_address or "").strip().upper() or None

    def _accepts(device: BLEDevice, advertisement: AdvertisementData) -> bool:
        if preferred and (device.address or "").upper() == preferred:
            return True
        if preferred and preferred_only:
            return False
        return matcher(device, advertisement)

    def _on_detect(device: BLEDevice, advertisement: AdvertisementData) -> None:
        if not _accepts(device, advertisement):
            return

        def _accept() -> None:
            if not found.done():
                found.set_result(device)

        loop.call_soon_threadsafe(_accept)

    scanner = BleakScanner(detection_callback=_on_detect)
    try:
        await scanner.start()
    except Exception:
        logger.exception("scanner.start %s", label)
        raise
    notified = False
    try:
        while not cancelled():
            try:
                return await asyncio.wait_for(asyncio.shield(found), timeout=poll_seconds)
            except TimeoutError:
                if on_waiting is not None and waiting_message and (repeat_waiting or not notified):
                    notified = True
                    await on_waiting(waiting_message)
        return None
    finally:
        try:
            await scanner.stop()
        except Exception:
            logger.debug("Falha ao parar o scanner (%s).", label, exc_info=True)
