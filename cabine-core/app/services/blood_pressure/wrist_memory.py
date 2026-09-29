"""HEM-6161T2 memory sync, copied from an OMRON connect HCI trace.

The official app does not wait on the standard 0x2A35 indication. After the
cuff finishes, it bonds once, then on every later connection:

1. enable the first Omron RX channel (that makes the monitor request pairing);
2. write 0x02 and sixteen zero bytes, expect 0x8200;
3. write 0x01 plus the stored 16-byte key, expect 0x8100;
4. read the EEPROM history and disconnect.

Command 0x00 plus the key (expect 0x8000) is only the first registration.
"""
from __future__ import annotations

import asyncio
import logging
import sys
from datetime import datetime
from typing import Any

from bleak import BleakClient, BleakError

from app.services.blood_pressure.hem7530 import RECORD_BYTE_SIZE, parse_hem7530_record
from app.services.blood_pressure.protocol import (
    RX_CHANNEL_UUIDS,
    UNLOCK_UUID,
    Hem7530Session,
)

logger = logging.getLogger(__name__)

# Key programmed by OMRON connect for this monitor (HCI, 28 Sep 2026).
WRIST_PAIRING_KEY = bytes.fromhex("2457524658e245d0a739be84710ee63b")
HISTORY_START = 0x0374
HISTORY_BYTES = 30 * RECORD_BYTE_SIZE
HISTORY_BLOCK = 0x38


class WristProtocolError(Exception):
    """The operator can act on this message."""


async def _arm_just_works(client: BleakClient) -> None:
    """Accept a later security request on a bond that already exists."""
    if sys.platform != "win32":
        return
    backend = getattr(client, "_backend", None)
    requester = getattr(backend, "_requester", None)
    if requester is None:
        return
    from winrt.windows.devices.enumeration import DeviceInformation, DevicePairingKinds

    info = await DeviceInformation.create_from_id_async(requester.device_information.id)
    if not info.pairing.is_paired:
        return

    def on_request(_sender, args) -> None:
        logger.info("HEM-6161T2 pairing request: %s", args.pairing_kind)
        if args.pairing_kind == DevicePairingKinds.PROVIDE_PIN:
            args.accept_with_pin("000000")
        else:
            args.accept()

    token = info.pairing.custom.add_pairing_requested(on_request)
    # WinRT drops the callback if these objects are garbage-collected.
    setattr(client, "_wrist_pair_guard", (info, token))


async def _unlock_reply(session: Hem7530Session, payload: bytes, timeout: float = 3.0) -> bytes:
    session._unlock_done.clear()
    await session.client.write_gatt_char(UNLOCK_UUID, payload, response=False)
    await asyncio.wait_for(session._unlock_done.wait(), timeout)
    return session._unlock_data


async def _open_wrist_once(client: BleakClient) -> Hem7530Session:
    session = Hem7530Session(client, pairing_key=WRIST_PAIRING_KEY)
    await client.start_notify(RX_CHANNEL_UUIDS[0], lambda *_args: None)
    await client.start_notify(UNLOCK_UUID, session._on_unlock)
    try:
        entered = await _unlock_reply(session, b"\x02" + b"\x00" * 16)
        if entered[:2] != bytes.fromhex("8200"):
            raise WristProtocolError(
                "O monitor não entrou no modo de vínculo. Segure o botão até aparecer P."
            )
        unlocked = await _unlock_reply(session, b"\x01" + WRIST_PAIRING_KEY)
        if unlocked[:2] != bytes.fromhex("8100"):
            programmed = await _unlock_reply(session, b"\x00" + WRIST_PAIRING_KEY)
            if programmed[:2] != bytes.fromhex("8000"):
                raise WristProtocolError(
                    "O monitor não aceitou o cadastro. Segure o botão até o P acender e não solte."
                )
            logger.info("HEM-6161T2 pairing key programmed")
        else:
            logger.info("HEM-6161T2 opened with the stored pairing key")
    finally:
        for uuid in (UNLOCK_UUID, RX_CHANNEL_UUIDS[0]):
            try:
                await client.stop_notify(uuid)
            except Exception:
                logger.debug("stop_notify %s ignored", uuid, exc_info=True)
    return session


async def _stop_wrist_notifies(client: BleakClient) -> None:
    for uuid in (UNLOCK_UUID, RX_CHANNEL_UUIDS[0]):
        try:
            await client.stop_notify(uuid)
        except Exception:
            logger.debug("stop_notify %s ignored", uuid, exc_info=True)


async def _program_key_on_link(client: BleakClient) -> bytes:
    session = Hem7530Session(client, pairing_key=WRIST_PAIRING_KEY)
    await client.start_notify(RX_CHANNEL_UUIDS[0], lambda *_args: None)
    await client.start_notify(UNLOCK_UUID, session._on_unlock)
    try:
        entered = b""
        for attempt in range(1, 6):
            try:
                entered = await _unlock_reply(session, b"\x02" + b"\x00" * 16, timeout=2.5)
            except TimeoutError:
                entered = b""
            prefix = entered[:2].hex()
            logger.info("HEM-6161T2 programming mode attempt %s reply %s", attempt, prefix or "none")
            if prefix == "8200":
                break
            if not client.is_connected:
                break
        if entered[:2] != bytes.fromhex("8200"):
            return entered
        programmed = await _unlock_reply(session, b"\x00" + WRIST_PAIRING_KEY, timeout=4.0)
        if programmed[:2] != bytes.fromhex("8000"):
            raise WristProtocolError(
                "O monitor não concluiu o pareamento. O visor precisa mostrar OK."
            )
        logger.info("HEM-6161T2 pairing key programmed")
        return entered
    finally:
        await _stop_wrist_notifies(client)


async def program_wrist_key(client: BleakClient) -> None:
    """Bond on the open link, then write the key. 820f means the bond is still missing."""
    from app.services.blood_pressure.hem6161 import bond_open_link

    await bond_open_link(client)
    try:
        entered = await _program_key_on_link(client)
    except (BleakError, TimeoutError, OSError):
        logger.info("HEM-6161T2 link dropped after the Windows bond; opening it again")
        entered = b""
    if entered[:2] == bytes.fromhex("8200"):
        return
    # Windows often applies the new bond only on the next connection.
    logger.info("HEM-6161T2 still locked (%s); reconnecting with the Windows bond", entered[:2].hex())
    try:
        await client.disconnect()
    except Exception:
        logger.debug("disconnect before bonded retry ignored", exc_info=True)
    await client.connect()
    entered = await _program_key_on_link(client)
    if entered[:2] != bytes.fromhex("8200"):
        raise WristProtocolError(
            "O Windows pareou, mas o monitor não entrou no cadastro. Segure o P até o visor mostrar OK."
        )


async def open_wrist(client: BleakClient) -> Hem7530Session:
    """Unlock after the OS bond. The monitor needs a moment once P is accepted."""
    await _arm_just_works(client)
    last: Exception | None = None
    for attempt in range(1, 6):
        try:
            return await _open_wrist_once(client)
        except (TimeoutError, BleakError, WristProtocolError) as exc:
            last = exc
            logger.info("HEM-6161T2 unlock attempt %s failed: %s", attempt, exc)
            if not client.is_connected:
                break
            await asyncio.sleep(0.8)
    if isinstance(last, WristProtocolError):
        raise last
    raise WristProtocolError(
        "O monitor não respondeu. Segure o botão até o P acender e clique em Parear sem soltar."
    ) from last


def parse_wrist_history(blob: bytes) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for offset in range(0, len(blob) - RECORD_BYTE_SIZE + 1, RECORD_BYTE_SIZE):
        item = parse_hem7530_record(blob[offset : offset + RECORD_BYTE_SIZE])
        if item is None:
            continue
        when = item["measured_at"]
        if not isinstance(when, datetime) or not 2020 <= when.year <= 2035:
            continue
        if not 60 <= item["sys_mmhg"] <= 250:
            continue
        found.append(item)
    return found


async def pull_wrist_records(client: BleakClient) -> list[dict[str, Any]]:
    session = await open_wrist(client)
    await session.start_transmission()
    try:
        blob = await session.read_eeprom(HISTORY_START, HISTORY_BYTES, HISTORY_BLOCK)
    finally:
        await session.end_transmission()
    records = parse_wrist_history(blob)
    logger.info("HEM-6161T2 history records: %s", len(records))
    return records
