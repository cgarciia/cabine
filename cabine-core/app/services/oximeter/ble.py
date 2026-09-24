from __future__ import annotations

import asyncio
import logging
import sys

from bleak import BleakClient, BleakError, BleakScanner
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData

from app.schemas.oximeter import OximeterDevice
from app.services.oximeter.parsers import make_creative_frame, make_xor_frame
from app.services.ble import apply_winrt_descriptor_tolerance

logger = logging.getLogger(__name__)

apply_winrt_descriptor_tolerance()

NAME_HINTS = (
    "pc-60",
    "pc60",
    "oxysmart",
    "creative",
    "oximeter",
    "spo2",
    "ichoice",
    "berry",
    "wellue",
    "viatom",
    "lepu",
    "prince",
    "yk-81",
    "yk81",
    "yonker",
)

YK81_NOTIFY = "cdeacd81-5235-4c07-8846-93a37ee6b86d"
YK81_DEVICE_NAME = "Incoterm OX500 BLE"

NUS_NOTIFY = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
NUS_WRITE = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
FFF1_NOTIFY = "0000fff1-0000-1000-8000-00805f9b34fb"
FFF2_WRITE = "0000fff2-0000-1000-8000-00805f9b34fb"
PREFERRED_NOTIFY = (
    FFF1_NOTIFY,
    NUS_NOTIFY,
    "0000ffe1-0000-1000-8000-00805f9b34fb",
    "0000ff02-0000-1000-8000-00805f9b34fb",
    "49535343-1e4d-4bd9-ba61-23c647249616",
)
SKIP_NOTIFY_NEEDLES = (
    "8ec900",
    "fe59",
    "00000003-0000-1000-8000-00805f9b34fb",
)
PREFERRED_WRITE = (
    FFF2_WRITE,
    NUS_WRITE,
    "0000ffe2-0000-1000-8000-00805f9b34fb",
)


def name_looks_like_oximeter(name: str | None) -> bool:
    if not name:
        return False
    lowered = name.lower().replace(" ", "").replace("-", "")
    return any(hint.replace("-", "") in lowered for hint in NAME_HINTS)


def _rssi_of(advertisement: AdvertisementData | None) -> int | None:
    if advertisement is None:
        return None
    rssi = getattr(advertisement, "rssi", None)
    return int(rssi) if rssi is not None else None


async def scan_oximeters(timeout: float = 10.0) -> list[OximeterDevice]:
    found: dict[str, OximeterDevice] = {}

    def _on_detect(device: BLEDevice, advertisement: AdvertisementData) -> None:
        name = device.name or advertisement.local_name
        if not name_looks_like_oximeter(name):
            return
        address = (device.address or "").upper()
        if not address:
            return
        found[address] = OximeterDevice(
            name=name or "Oxímetro",
            address=address,
            rssi=_rssi_of(advertisement),
        )

    scanner = BleakScanner(detection_callback=_on_detect)
    await scanner.start()
    try:
        await asyncio.sleep(timeout)
    finally:
        await scanner.stop()
    return sorted(found.values(), key=lambda item: item.rssi or -999, reverse=True)


async def wait_for_oximeter(
    preferred_address: str | None = None,
    *,
    cancelled,
    on_waiting=None,
) -> BLEDevice | None:
    """Fica varrendo até o oxímetro aparecer (PC-60NW liga com o dedo; OX500 pelo botão)."""
    loop = asyncio.get_running_loop()
    found: asyncio.Future[BLEDevice] = loop.create_future()
    preferred = (preferred_address or "").strip().upper() or None

    def _on_detect(device: BLEDevice, advertisement: AdvertisementData) -> None:
        name = device.name or advertisement.local_name
        address = (device.address or "").upper()
        mac_hit = bool(preferred and address == preferred)
        if not mac_hit and not name_looks_like_oximeter(name):
            return

        def _accept() -> None:
            if not found.done():
                found.set_result(device)

        loop.call_soon_threadsafe(_accept)

    scanner = BleakScanner(detection_callback=_on_detect)
    try:
        await scanner.start()
    except Exception:
        logger.exception("scanner.start oxímetro")
        raise
    try:
        while not cancelled():
            try:
                return await asyncio.wait_for(asyncio.shield(found), timeout=3.0)
            except asyncio.TimeoutError:
                if on_waiting is not None:
                    await on_waiting("Procurando o oxímetro. Encaixe o dedo no clipe e, se ele não ligar, aperte o botão.")
                continue
        return None
    finally:
        try:
            await scanner.stop()
        except Exception:
            logger.debug("Falha ao parar o scanner do oxímetro.", exc_info=True)


def _service_count(client: BleakClient) -> int:
    try:
        return len(list(client.services))
    except Exception:
        return 0


async def connect_oximeter(device: BLEDevice) -> BleakClient:
    attempts: list[dict] = []
    if sys.platform == "win32":
        attempts = [
            {"winrt": {"use_cached_services": True}},
            {"winrt": {"use_cached_services": False}},
            {},
        ]
    else:
        attempts = [{}]

    errors: list[str] = []
    for kwargs in attempts:
        client = BleakClient(device, timeout=30.0, **kwargs)
        try:
            await client.connect()
            if _service_count(client) == 0:
                raise BleakError("Nenhum serviço GATT encontrado.")
            return client
        except Exception as exc:
            errors.append(f"{kwargs or 'default'}: {exc}")
            logger.warning("Tentativa oximetro GATT falhou (%s): %s", kwargs or "default", exc)
            try:
                await client.disconnect()
            except Exception:
                pass
    raise BleakError(
        "Não foi possível conectar ao oxímetro. "
        + (errors[-1] if errors else "erro desconhecido")
    )


def is_yk81(client: BleakClient) -> bool:
    """Yonker YK-81C (Incoterm OX500 BLE): transmite sozinho em cdeacd81, sem comando do host."""
    try:
        return client.services.get_characteristic(YK81_NOTIFY) is not None
    except Exception:
        return False


def _can_notify(char) -> bool:
    return "notify" in char.properties or "indicate" in char.properties


def _ignore_notify(_sender, _data: bytearray) -> None:
    pass


async def subscribe_yk81(client: BleakClient, handler) -> int:
    """Assina cdeacd81 (dados) e também os demais notify, como o app de referência faz."""
    try:
        await client.start_notify(YK81_NOTIFY, handler)
    except Exception:
        logger.warning("Notify YK-81C falhou em %s", YK81_NOTIFY, exc_info=True)
        return 0

    for service in client.services:
        for char in service.characteristics:
            if str(char.uuid).lower() == YK81_NOTIFY or not _can_notify(char):
                continue
            try:
                await client.start_notify(char, _ignore_notify)
            except Exception:
                logger.debug("Notify extra ignorado em %s", char.uuid, exc_info=True)
    return 1


def _skip_notify(uuid: str) -> bool:
    lowered = str(uuid).lower()
    return any(needle in lowered for needle in SKIP_NOTIFY_NEEDLES)


def start_commands() -> list[tuple[str, bytes]]:
    """Comandos candidatos para o PC-60NW (FFF2). O aparelho só transmite depois do host pedir."""
    return [
        ("AA55-0F-84-01", make_creative_frame(0x0F, bytes([0x84, 0x01]))),
        ("AA55-0F-84-02", make_creative_frame(0x0F, bytes([0x84, 0x02]))),
        ("AA55-0F-84", make_creative_frame(0x0F, bytes([0x84]))),
        ("AA55-0F-85-01", make_creative_frame(0x0F, bytes([0x85, 0x01]))),
        ("AA55-0F-02", make_creative_frame(0x0F, bytes([0x02]))),
        ("AA55-0F-01", make_creative_frame(0x0F, bytes([0x01]))),
        ("AA55-F0-01", make_creative_frame(0xF0, bytes([0x01]))),
        ("AA55-0F-84-00", make_creative_frame(0x0F, bytes([0x84, 0x00]))),
        ("AA55-0F-84-01-xor", make_xor_frame(0x0F, bytes([0x84, 0x01]))),
        ("AA55-0F-84-02-xor", make_xor_frame(0x0F, bytes([0x84, 0x02]))),
        ("raw-AA550F038401", bytes.fromhex("AA550F038401")),
        ("raw-AA550F038402", bytes.fromhex("AA550F038402")),
        ("enable-01", b"\x01"),
    ]


def _write_chars(client: BleakClient) -> list:
    found = []
    for uuid in PREFERRED_WRITE:
        char = client.services.get_characteristic(uuid)
        if char is None:
            continue
        if "write" not in char.properties and "write-without-response" not in char.properties:
            continue
        found.append(char)
    if found:
        return found
    for service in client.services:
        for char in service.characteristics:
            if "write-without-response" in char.properties or "write" in char.properties:
                if _skip_notify(str(char.uuid)):
                    continue
                found.append(char)
    return found


STREAM_REQUESTS = (
    make_creative_frame(0x0F, bytes([0x84, 0x01])),
    make_creative_frame(0x0F, bytes([0x84, 0x02])),
)


async def _write_to_all(client: BleakClient, chars: list, payload: bytes) -> int:
    sent = 0
    for char in chars:
        try:
            no_response = "write-without-response" in char.properties
            await client.write_gatt_char(char.uuid, payload, response=not no_response)
            sent += 1
        except Exception:
            logger.debug("Write FFF2 falhou em %s", char.uuid, exc_info=True)
    return sent


async def write_start_stream(client: BleakClient, *, all_candidates: bool = False) -> int:
    chars = _write_chars(client)
    if not chars:
        logger.warning("Oxímetro sem característica de escrita (FFF2).")
        return 0
    payloads = [payload for _, payload in start_commands()] if all_candidates else STREAM_REQUESTS
    sent = 0
    for payload in payloads:
        sent += await _write_to_all(client, chars, payload)
        await asyncio.sleep(0.15)
    return sent


async def keep_alive_stream(client: BleakClient, interval: float = 2.0) -> None:
    chars = _write_chars(client)
    if not chars:
        return
    while client.is_connected:
        for payload in STREAM_REQUESTS:
            await _write_to_all(client, chars, payload)
            await asyncio.sleep(0.12)
        await asyncio.sleep(interval)


async def subscribe_notifications(client: BleakClient, handler) -> int:
    subscribed = 0
    for char_uuid in PREFERRED_NOTIFY:
        char = client.services.get_characteristic(char_uuid)
        if char is None or _skip_notify(str(char.uuid)) or not _can_notify(char):
            continue
        try:
            await client.start_notify(char.uuid, handler)
            subscribed += 1
            logger.info("Notify oxímetro em %s", char.uuid)
        except Exception:
            logger.debug("Notify oxímetro falhou em %s", char_uuid, exc_info=True)

    if not subscribed:
        for service in client.services:
            for char in service.characteristics:
                if _skip_notify(str(char.uuid)) or not _can_notify(char):
                    continue
                try:
                    await client.start_notify(char.uuid, handler)
                    subscribed += 1
                    logger.info("Notify oxímetro (fallback) em %s", char.uuid)
                except Exception:
                    logger.debug("Notify oxímetro (fallback) falhou em %s", char.uuid, exc_info=True)
    return subscribed
