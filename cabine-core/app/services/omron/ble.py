from __future__ import annotations

import asyncio
import logging
import sys

from bleak import BleakClient, BleakError, BleakScanner
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData

from app.services.ble import apply_winrt_descriptor_tolerance

logger = logging.getLogger(__name__)

apply_winrt_descriptor_tolerance()

NAME_HINTS = (
    "omron",
    "complete",
    "hem-7530",
    "hem7530",
    "blesmart",
)

PAIRING_KEY = bytes.fromhex("deadbeaf12341234deadbeaf12341234")
OMRON_COMPANY_ID = 0x020E
OMRON_SERVICE_NEEDLES = (
    "ecbe3980-c9a2-11e1-b1bd-0002a5d5c51b",
    "ecbe3980",
)


def name_looks_like_omron(name: str | None) -> bool:
    if not name:
        return False
    lowered = name.lower().replace(" ", "")
    return any(hint.replace("-", "") in lowered.replace("-", "") for hint in NAME_HINTS)


def advertisement_looks_like_omron(advertisement: AdvertisementData | None, name: str | None) -> bool:
    if name_looks_like_omron(name):
        return True
    if advertisement is None:
        return False
    if OMRON_COMPANY_ID in (advertisement.manufacturer_data or {}):
        return True
    for uuid in advertisement.service_uuids or []:
        text = str(uuid).lower()
        if any(needle in text for needle in OMRON_SERVICE_NEEDLES):
            return True
    return False


def _rssi_of(advertisement: AdvertisementData | None) -> int | None:
    if advertisement is None:
        return None
    rssi = getattr(advertisement, "rssi", None)
    return int(rssi) if rssi is not None else None


async def scan_omron(timeout: float = 12.0) -> list[tuple[BLEDevice, AdvertisementData | None]]:
    found: dict[str, tuple[BLEDevice, AdvertisementData | None]] = {}

    def _on_detect(device: BLEDevice, advertisement: AdvertisementData) -> None:
        name = device.name or advertisement.local_name
        if not advertisement_looks_like_omron(advertisement, name):
            return
        address = (device.address or "").upper()
        if not address:
            return
        found[address] = (device, advertisement)

    scanner = BleakScanner(detection_callback=_on_detect)
    await scanner.start()
    try:
        await asyncio.sleep(timeout)
    finally:
        await scanner.stop()
    ranked = sorted(
        found.values(),
        key=lambda item: _rssi_of(item[1]) or -999,
        reverse=True,
    )
    return ranked


async def wait_for_omron(
    preferred_address: str | None = None,
    *,
    cancelled,
    on_waiting=None,
) -> BLEDevice | None:
    loop = asyncio.get_running_loop()
    found: asyncio.Future[BLEDevice] = loop.create_future()
    preferred = (preferred_address or "").strip().upper() or None
    notified = False

    def _on_detect(device: BLEDevice, advertisement: AdvertisementData) -> None:
        name = device.name or advertisement.local_name
        address = (device.address or "").upper()
        mac_hit = bool(preferred and address == preferred)
        name_hit = advertisement_looks_like_omron(advertisement, name)
        if preferred and not mac_hit:
            return
        if not mac_hit and not name_hit:
            return

        def _accept() -> None:
            if not found.done():
                found.set_result(device)

        loop.call_soon_threadsafe(_accept)

    scanner = BleakScanner(detection_callback=_on_detect)
    await scanner.start()
    try:
        while not cancelled():
            try:
                return await asyncio.wait_for(asyncio.shield(found), timeout=4.0)
            except TimeoutError:
                if on_waiting is not None and not notified:
                    notified = True
                    await on_waiting(
                        "Pareado. Coloque o manguito, toque nos sensores e meça — o totem espera sozinho."
                    )
                continue
        return None
    finally:
        try:
            await scanner.stop()
        except Exception:
            logger.debug("Falha ao parar o scanner Omron.", exc_info=True)


def _service_count(client: BleakClient) -> int:
    try:
        return len(list(client.services))
    except Exception:
        return 0


async def connect_omron(device: BLEDevice | str) -> BleakClient:
    attempts: list[dict] = [{}]
    if sys.platform == "win32":
        attempts = [
            {"winrt": {"use_cached_services": True}},
            {"winrt": {"use_cached_services": False}},
            {},
        ]
    errors: list[str] = []
    for kwargs in attempts:
        client = BleakClient(device, timeout=20.0, **kwargs)
        try:
            await client.connect()
            if _service_count(client) == 0:
                raise BleakError("Nenhum serviço GATT encontrado.")
            try:
                await client.pair()
            except Exception:
                logger.debug("Bond Windows já existia ou pair() não foi necessário.", exc_info=True)
            return client
        except Exception as exc:
            errors.append(str(exc))
            logger.warning("Tentativa Omron GATT falhou (%s): %s", kwargs or "default", exc)
            try:
                await client.disconnect()
            except Exception:
                pass
    raise BleakError("Não foi possível conectar ao Omron Complete. " + (errors[-1] if errors else ""))
