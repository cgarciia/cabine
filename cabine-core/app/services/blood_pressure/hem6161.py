from __future__ import annotations

import asyncio
import logging

from bleak import BleakClient
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData

from app.schemas.ble import BleDevice
from app.services.ble.connect import connect_with_fallback
from app.services.ble.scanner import advertised_name, as_ble_devices, scan_devices, wait_for_device
from app.services.blood_pressure.gatt_bp import BP_MEASUREMENT_UUID

logger = logging.getLogger(__name__)

DEVICE_LABEL = "HEM-6161T2"
WAITING_MESSAGE = "Faça a medição no pulso. Quando o visor mostrar o valor, o totem busca a leitura salva."

# The model code is rarely the BLE name. Intelli IT wrist units advertise as
# OMRON / BLESmart, company 0x020E, or the Omron custom service.
NAME_HINTS = (
    "hem-6161",
    "6161t",
)
GENERIC_OMRON_HINTS = (
    "blesmart",
    "omron",
)
OMRON_COMPANY_ID = 0x020E
SERVICE_NEEDLES = (
    "fe4a",
    "ecbe3980",
)


def _compact(name: str) -> str:
    return name.lower().replace(" ", "").replace("-", "")


def name_looks_like_hem6161(name: str | None) -> bool:
    if not name:
        return False
    compact = _compact(name)
    return any(hint.replace("-", "") in compact for hint in NAME_HINTS)


def _is_arm_complete(name: str | None) -> bool:
    """The HEM-7530T must stay out of the wrist list."""
    if not name:
        return False
    compact = _compact(name)
    return "7530" in compact or "complete" in compact


def advertisement_looks_like_hem6161(
    advertisement: AdvertisementData | None,
    name: str | None,
) -> bool:
    shown = name or (advertisement.local_name if advertisement else None)
    if _is_arm_complete(shown):
        return False
    if name_looks_like_hem6161(shown):
        return True
    if shown and any(hint in _compact(shown) for hint in GENERIC_OMRON_HINTS):
        return True
    if advertisement is None:
        return False
    if OMRON_COMPANY_ID in (advertisement.manufacturer_data or {}):
        return True
    for uuid in advertisement.service_uuids or []:
        text = str(uuid).lower()
        if any(needle in text for needle in SERVICE_NEEDLES):
            return True
    return False


def _matches(device: BLEDevice, advertisement: AdvertisementData) -> bool:
    return advertisement_looks_like_hem6161(advertisement, advertised_name(device, advertisement))


async def scan_hem6161(timeout: float = 12.0) -> list[BleDevice]:
    return as_ble_devices(await scan_devices(_matches, timeout), DEVICE_LABEL)


async def wait_for_hem6161(
    preferred_address: str | None = None,
    *,
    cancelled,
    on_waiting=None,
) -> BLEDevice | None:
    """With a known MAC, only that wrist monitor is accepted."""
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


async def connect_hem6161(device: BLEDevice | str) -> BleakClient:
    # Readings reuse the bond created while P was held. Do not pair again.
    return await connect_with_fallback(device, label=DEVICE_LABEL, timeout=20.0, pair=False)


async def _windows_is_paired(device_id: str) -> bool:
    from winrt.windows.devices.enumeration import DeviceInformation

    info = await DeviceInformation.create_from_id_async(device_id)
    return bool(info and info.pairing.is_paired)


async def bond_open_link(client: BleakClient) -> None:
    """Finish the Windows bond on the connection that already reached the monitor.

    PairAsync on the address alone never opens this device. PairAsync while
    another link is open makes Windows report a connection failure. The monitor
    sends its pairing request only after the RX channel is enabled.
    """
    import sys

    from app.services.blood_pressure.wrist_memory import WristProtocolError

    if sys.platform != "win32":
        raise WristProtocolError("O pareamento deste monitor é feito pelo Bluetooth do Windows.")

    backend = getattr(client, "_backend", None)
    requester = getattr(backend, "_requester", None)
    if requester is None:
        raise WristProtocolError("O monitor sumiu antes do pareamento. Segure o botão até aparecer P.")

    from app.services.blood_pressure.protocol import RX_CHANNEL_UUIDS
    from winrt.windows.devices.enumeration import DeviceInformation, DevicePairingKinds, DevicePairingResultStatus

    device_id = requester.device_information.id
    if await _windows_is_paired(device_id):
        logger.info("%s already paired on this PC", DEVICE_LABEL)
        return

    await client.start_notify(RX_CHANNEL_UUIDS[0], lambda *_args: None)
    try:
        for _ in range(4):
            if await _windows_is_paired(device_id):
                logger.info("%s paired from the monitor request", DEVICE_LABEL)
                return
            await asyncio.sleep(0.5)

        info = await DeviceInformation.create_from_id_async(device_id)
        logger.info("%s completing the bond on the open link", DEVICE_LABEL)
        try:
            result = await asyncio.wait_for(
                info.pairing.custom.pair_async(DevicePairingKinds.CONFIRM_ONLY),
                timeout=70,
            )
        except TimeoutError:
            raise WristProtocolError(
                "A pergunta de pareamento do Windows não foi aceita a tempo. Segure o P e aceite o aviso deste computador."
            ) from None
        status_name = result.status.name
        level = getattr(getattr(result, "protection_level_used", None), "name", None)
        logger.info("%s Windows pair status %s protection %s", DEVICE_LABEL, status_name, level)
        if result.status in (
            DevicePairingResultStatus.PAIRED,
            DevicePairingResultStatus.ALREADY_PAIRED,
        ):
            return
        if status_name in {"REQUIRED_HANDLER_NOT_REGISTERED", "OPERATION_ALREADY_IN_PROGRESS"}:
            for _ in range(45):
                if await _windows_is_paired(device_id):
                    return
                await asyncio.sleep(1)
        if status_name == "PAIRING_CANCELED":
            raise WristProtocolError("O pareamento foi cancelado. Clique em Parear e aceite a pergunta do Windows.")
        raise WristProtocolError(
            f"O Windows não gravou o vínculo ({status_name}). O monitor conecta, mas o pareamento não conclui."
        )
    finally:
        try:
            await client.stop_notify(RX_CHANNEL_UUIDS[0])
        except Exception:
            logger.debug("stop RX after bond ignored", exc_info=True)


async def connect_hem6161_bonded(device: BLEDevice | str) -> BleakClient:
    """Open GATT first. Windows asks to pair only after the link is up."""
    client = BleakClient(device, timeout=40.0)
    await client.connect()
    return client


def describe_gatt(client: BleakClient) -> str:
    services = getattr(client, "services", None)
    if not services:
        return "(sem serviços)"
    lines: list[str] = []
    for service in services:
        lines.append(str(service.uuid))
        for char in service.characteristics:
            props = ",".join(char.properties or [])
            lines.append(f"  {char.uuid} [{props}]")
    return "\n".join(lines) or "(sem serviços)"


def log_gatt_map(client: BleakClient) -> str:
    """Record the live GATT table. The public HEM-6161T2 manual does not publish it."""
    table = describe_gatt(client)
    logger.info("HEM-6161T2 GATT map:\n%s", table)
    return table


def has_standard_bp_measurement(client: BleakClient) -> bool:
    target = BP_MEASUREMENT_UUID.lower()
    services = getattr(client, "services", None)
    if not services:
        return False
    for service in services:
        for char in service.characteristics:
            if str(char.uuid).lower() == target:
                return True
    return False
