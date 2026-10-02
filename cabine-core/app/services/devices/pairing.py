from __future__ import annotations

import asyncio
import logging

from bleak import BleakScanner
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import device as device_crud
from app.models.device import Device
from app.schemas.ble import BleDevice
from app.schemas.devices import DeviceKind
from app.schemas.scale import ScaleAdapter, ScaleParser
from app.services.ble import ble_radio_lock, normalize_mac
from app.services.ble.connect import connect_with_fallback
from app.services.ble.scanner import advertised_name, as_ble_devices, scan_devices
from app.services.blood_pressure.ble import connect_hem7530, scan_hem7530
from app.services.blood_pressure.hem6161 import connect_hem6161_bonded, scan_hem6161
from app.services.blood_pressure.protocol import Hem7530Session
from app.services.blood_pressure.wrist_memory import WristProtocolError, program_wrist_key
from app.services.oximeter.ble import scan_oximeters

logger = logging.getLogger(__name__)

SCAN_TIMEOUT = 12.0
SCALE_NAME_HINTS = ("rm-rd", "rd2504", "2504a")
SCALE_SERVICE_NEEDLE = "ffb0"


class PairingError(Exception):
    """The operator can act on this message."""


def _scale_matches(device: BLEDevice, advertisement: AdvertisementData) -> bool:
    name = advertised_name(device, advertisement) or ""
    compact = name.lower().replace(" ", "").replace("-", "")
    if any(hint.replace("-", "") in compact for hint in SCALE_NAME_HINTS):
        return True
    for uuid in advertisement.service_uuids or []:
        if SCALE_SERVICE_NEEDLE in str(uuid).lower():
            return True
    return False


async def _scan_scales() -> list[BleDevice]:
    found = await scan_devices(_scale_matches, SCAN_TIMEOUT)
    return as_ble_devices(found, "RM-RD2504A")


async def scan_kind(kind: DeviceKind) -> list[BleDevice]:
    async with ble_radio_lock:
        if kind is DeviceKind.scale:
            return await _scan_scales()
        if kind is DeviceKind.oximeter:
            return await scan_oximeters(SCAN_TIMEOUT)
        if kind is DeviceKind.blood_pressure_ecg:
            return await scan_hem7530(SCAN_TIMEOUT)
        return await scan_hem6161(20.0)


async def _await_advertisement(address: str, timeout: float) -> BLEDevice:
    """Windows only connects reliably to a device that is advertising right now."""
    loop = asyncio.get_running_loop()
    found: asyncio.Future[BLEDevice] = loop.create_future()
    target = address.upper()

    def on_detect(device: BLEDevice, _advertisement: AdvertisementData) -> None:
        if (device.address or "").upper() == target and not found.done():
            loop.call_soon_threadsafe(found.set_result, device)

    scanner = BleakScanner(detection_callback=on_detect)
    await scanner.start()
    try:
        return await asyncio.wait_for(found, timeout)
    except TimeoutError:
        raise PairingError(
            "O aparelho não anunciou. Clique em Parear e, nesse instante, aperte o botão até aparecer P."
        ) from None
    finally:
        await scanner.stop()


async def _pair_client(kind: DeviceKind, address: str) -> str:
    mac = normalize_mac(address)
    async with ble_radio_lock:
        live = await _await_advertisement(mac, 20.0)
        client = None
        try:
            if kind is DeviceKind.scale:
                client = await connect_with_fallback(live, label="RM-RD2504A", timeout=20.0, pair=True)
            elif kind is DeviceKind.oximeter:
                client = await connect_with_fallback(live, label="oxímetro", timeout=30.0, pair=True)
            elif kind is DeviceKind.blood_pressure_ecg:
                client = await connect_hem7530(live)
                await Hem7530Session(client).pair_unlock_key()
            else:
                client = await connect_hem6161_bonded(live)
                await program_wrist_key(client)
        finally:
            if client is not None:
                try:
                    await client.disconnect()
                except Exception:
                    logger.debug("Disconnect after pairing ignored.", exc_info=True)
    return mac


_DRIVERS = {
    DeviceKind.scale: (ScaleAdapter.ble_rm_rd2504a.value, ScaleParser.rm_rd2504a_ffb2.value),
    DeviceKind.oximeter: ("ble_oximeter", "pc60nw"),
    DeviceKind.blood_pressure_ecg: ("ble_hem7530", "hem7530"),
    DeviceKind.blood_pressure_wrist: ("ble_hem6161", "hem6161"),
}


async def _remember_device(db: AsyncSession, kind: DeviceKind, name: str, address: str) -> Device:
    adapter, parser = _DRIVERS[kind]
    try:
        return await device_crud.save_paired(
            db,
            slug=kind.value,
            description=name,
            address=address,
            adapter=adapter,
            parser=parser,
            make_default=True,
        )
    except ValueError as exc:
        raise PairingError(str(exc)) from exc


async def pair_kind(db: AsyncSession, kind: DeviceKind, address: str, name: str | None = None) -> Device:
    try:
        mac = await _pair_client(kind, address)
    except PairingError:
        raise
    except WristProtocolError as exc:
        raise PairingError(str(exc)) from exc
    except ValueError as exc:
        text = str(exc)
        if "pairing-key" in text or "pairing key" in text or "-P-" in text:
            raise PairingError("O visor do monitor com ECG precisa mostrar -P- neste momento.") from exc
        raise PairingError("Não foi possível parear. Aperte o botão do aparelho e tente de novo.") from exc
    except Exception as exc:
        logger.exception("Pairing %s at %s failed", kind.value, address)
        raise PairingError("O aparelho não respondeu. Aperte o botão de novo e pareie em seguida.") from exc

    label = (name or "").strip() or _default_name(kind)
    return await _remember_device(db, kind, label, mac)


def _default_name(kind: DeviceKind) -> str:
    if kind is DeviceKind.scale:
        return "RM-RD2504A"
    if kind is DeviceKind.oximeter:
        return "Oxímetro"
    if kind is DeviceKind.blood_pressure_ecg:
        return "HEM-7530T"
    return "HEM-6161T2"
