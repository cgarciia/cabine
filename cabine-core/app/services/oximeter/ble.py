from __future__ import annotations

import asyncio
import logging
import sys
import time

from bleak import BleakClient, BleakError, BleakScanner
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData

from app.schemas.oximeter import OximeterDevice
from app.services.oximeter.debuglog import dbg
from app.services.oximeter.parsers import make_creative_frame, make_xor_frame
from app.services.scale.adapters.ble_winrt_patch import apply_winrt_descriptor_tolerance

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
)

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
    """Fica varrendo até o PC-60NW aparecer (em geral, quando o dedo liga o aparelho)."""
    loop = asyncio.get_running_loop()
    found: asyncio.Future[BLEDevice] = loop.create_future()
    preferred = (preferred_address or "").strip().upper() or None
    seen: dict[str, float] = {}
    dbg("SCAN start preferred=%s platform=%s", preferred or "-", sys.platform)

    def _on_detect(device: BLEDevice, advertisement: AdvertisementData) -> None:
        name = device.name or advertisement.local_name
        address = (device.address or "").upper()
        rssi = _rssi_of(advertisement)
        services = []
        try:
            services = [str(item) for item in (advertisement.service_uuids or [])]
        except Exception:
            services = []
        now = time.monotonic()
        last = seen.get(address, 0)
        if now - last >= 2.5:
            seen[address] = now
            dbg(
                "ADV addr=%s name=%r rssi=%s services=%s",
                address or "?",
                name,
                rssi,
                services or "-",
            )
        mac_hit = bool(preferred and address == preferred)
        name_hit = name_looks_like_oximeter(name)
        if not mac_hit and not name_hit:
            return
        dbg("MATCH addr=%s name=%r mac_hit=%s name_hit=%s", address, name, mac_hit, name_hit)

        def _accept() -> None:
            if not found.done():
                found.set_result(device)

        loop.call_soon_threadsafe(_accept)

    scanner = BleakScanner(detection_callback=_on_detect)
    try:
        await scanner.start()
        dbg("SCAN scanner.start() ok")
    except Exception:
        dbg("SCAN scanner.start() FALHOU")
        logger.exception("scanner.start oxímetro")
        raise
    try:
        ticks = 0
        while not cancelled():
            try:
                device = await asyncio.wait_for(asyncio.shield(found), timeout=3.0)
                dbg("SCAN achou %s %s", device.address, device.name)
                return device
            except asyncio.TimeoutError:
                ticks += 1
                dbg("SCAN ainda nada (%.0fs) ads_unicos=%s", ticks * 3, len(seen))
                if on_waiting is not None:
                    await on_waiting("Procurando o oxímetro… coloque o dedo no sensor.")
                continue
        dbg("SCAN cancelado")
        return None
    finally:
        try:
            await scanner.stop()
            dbg("SCAN scanner.stop() ok")
        except Exception:
            dbg("SCAN scanner.stop() falhou")
            logger.debug("Falha ao parar o scanner do oxímetro.", exc_info=True)


def _service_count(client: BleakClient) -> int:
    try:
        return len(list(client.services))
    except Exception:
        return 0


async def connect_oximeter(device: BLEDevice) -> BleakClient:
    dbg("CONNECT tentando %s %s", device.address, device.name)
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
            count = _service_count(client)
            dbg("CONNECT ok kwargs=%s services=%s connected=%s", kwargs or "default", count, client.is_connected)
            if count == 0:
                raise BleakError("Nenhum serviço GATT encontrado.")
            _dump_gatt(client)
            return client
        except Exception as exc:
            errors.append(f"{kwargs or 'default'}: {exc}")
            dbg("CONNECT falhou kwargs=%s err=%s", kwargs or "default", exc)
            logger.warning("Tentativa oximetro GATT falhou (%s): %s", kwargs or "default", exc)
            try:
                await client.disconnect()
            except Exception:
                pass
    raise BleakError(
        "Não foi possível conectar ao oxímetro. "
        + (errors[-1] if errors else "erro desconhecido")
    )


def _dump_gatt(client: BleakClient) -> None:
    dbg("GATT ---")
    try:
        for service in client.services:
            dbg("GATT svc %s %s", service.uuid, service.description)
            for char in service.characteristics:
                dbg("GATT   char %s %s %s", char.uuid, char.properties, char.description)
    except Exception as exc:
        dbg("GATT dump falhou: %s", exc)


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


async def write_start_stream(client: BleakClient, *, all_candidates: bool = False) -> int:
    chars = _write_chars(client)
    if not chars:
        logger.warning("Oxímetro sem característica de escrita (FFF2).")
        return 0
    commands = start_commands() if all_candidates else [
        ("AA55-0F-84-01", make_creative_frame(0x0F, bytes([0x84, 0x01]))),
        ("AA55-0F-84-02", make_creative_frame(0x0F, bytes([0x84, 0x02]))),
    ]
    sent = 0
    for label, payload in commands:
        for char in chars:
            try:
                no_response = "write-without-response" in char.properties
                await client.write_gatt_char(char.uuid, payload, response=not no_response)
                sent += 1
                dbg("WRITE %s -> %s hex=%s resp=%s", label, char.uuid, payload.hex(" "), not no_response)
            except Exception as exc:
                dbg("WRITE falhou %s %s err=%s", label, char.uuid, exc)
        await asyncio.sleep(0.15)
    return sent


async def keep_alive_stream(client: BleakClient, interval: float = 2.0) -> None:
    chars = _write_chars(client)
    if not chars:
        return
    payloads = [
        make_creative_frame(0x0F, bytes([0x84, 0x01])),
        make_creative_frame(0x0F, bytes([0x84, 0x02])),
    ]
    while client.is_connected:
        for payload in payloads:
            for char in chars:
                try:
                    no_response = "write-without-response" in char.properties
                    await client.write_gatt_char(char.uuid, payload, response=not no_response)
                except Exception:
                    logger.debug("Keep-alive FFF2 falhou.", exc_info=True)
            await asyncio.sleep(0.12)
        await asyncio.sleep(interval)


async def subscribe_notifications(client: BleakClient, handler) -> int:
    subscribed = 0
    dbg("SUBSCRIBE begin")
    for char_uuid in PREFERRED_NOTIFY:
        char = client.services.get_characteristic(char_uuid)
        if char is None or _skip_notify(str(char.uuid)):
            continue
        if "notify" not in char.properties and "indicate" not in char.properties:
            continue
        try:
            await client.start_notify(char.uuid, handler)
            subscribed += 1
            dbg("NOTIFY on %s", char.uuid)
            logger.info("Notify oxímetro em %s", char.uuid)
        except Exception as exc:
            dbg("NOTIFY falhou %s type=%s err=%s", char_uuid, type(exc).__name__, exc)

    if not subscribed:
        for service in client.services:
            for char in service.characteristics:
                if _skip_notify(str(char.uuid)):
                    continue
                if "notify" not in char.properties and "indicate" not in char.properties:
                    continue
                try:
                    await client.start_notify(char.uuid, handler)
                    subscribed += 1
                    dbg("NOTIFY fallback on %s", char.uuid)
                    logger.info("Notify oxímetro (fallback) em %s", char.uuid)
                except Exception as exc:
                    dbg(
                        "NOTIFY fallback falhou %s type=%s err=%s",
                        char.uuid,
                        type(exc).__name__,
                        exc,
                    )
    return subscribed
