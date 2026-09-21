from __future__ import annotations

import asyncio
import logging

from bleak import BleakClient
from bleak.backends.characteristic import BleakGATTCharacteristic

from app.services.blood_pressure.ble import PAIRING_KEY
from app.services.blood_pressure.hem7530 import (
    RECORD_BYTE_SIZE,
    RECORDS_PER_USER,
    TRANSMISSION_BLOCK_SIZE,
    USER_START_ADDRESS,
    parse_hem7530_record,
)

logger = logging.getLogger(__name__)

PARENT_SERVICE_UUID = "ecbe3980-c9a2-11e1-b1bd-0002a5d5c51b"
RX_CHANNEL_UUIDS = (
    "49123040-aee8-11e1-a74d-0002a5d5c51b",
    "4d0bf320-aee8-11e1-a0d9-0002a5d5c51b",
    "5128ce60-aee8-11e1-b84b-0002a5d5c51b",
    "560f1420-aee8-11e1-8184-0002a5d5c51b",
)
TX_CHANNEL_UUIDS = (
    "db5b55e0-aee7-11e1-965e-0002a5d5c51b",
    "e0b8a060-aee7-11e1-92f4-0002a5d5c51b",
    "0ae12b00-aee8-11e1-a192-0002a5d5c51b",
    "10e1ba60-aee8-11e1-89e5-0002a5d5c51b",
)
UNLOCK_UUID = "b305b680-aee7-11e1-a730-0002a5d5c51b"


def xor_checksum(payload: bytes) -> int:
    value = 0
    for byte in payload:
        value ^= byte
    return value


class Hem7530Session:
    """GATT session for the HEM-7530T proprietary EEPROM protocol."""

    def __init__(self, client: BleakClient, *, pairing_key: bytes = PAIRING_KEY) -> None:
        self.client = client
        self.pairing_key = pairing_key
        self._rx_by_handle: dict[int, int] = {}
        self._rx_buffers: list[bytes | None] = [None] * 4
        self._rx_done = asyncio.Event()
        self._rx_packet_type = b""
        self._rx_address = b""
        self._rx_data = b""
        self._unlock_done = asyncio.Event()
        self._unlock_data = b""
        self._rx_notify_on = False

    def has_legacy_service(self) -> bool:
        return self.client.services.get_service(PARENT_SERVICE_UUID) is not None

    def _map_rx_handles(self) -> None:
        self._rx_by_handle = {}
        for index, uuid in enumerate(RX_CHANNEL_UUIDS):
            char = self.client.services.get_characteristic(uuid)
            if char is not None:
                self._rx_by_handle[char.handle] = index

    def _on_rx(self, characteristic: BleakGATTCharacteristic | int, data: bytearray) -> None:
        if len(RX_CHANNEL_UUIDS) == 1:
            channel = 0
        elif isinstance(characteristic, int):
            channel = self._rx_by_handle.get(characteristic, 0)
        else:
            channel = self._rx_by_handle.get(characteristic.handle, 0)
        self._rx_buffers[channel] = bytes(data)
        first = self._rx_buffers[0]
        if not first:
            return
        packet_size = first[0]
        needed = range((packet_size + 15) // 16)
        for index in needed:
            if self._rx_buffers[index] is None:
                return
        combined = bytearray()
        for index in needed:
            chunk = self._rx_buffers[index]
            if chunk is None:
                return
            combined += chunk
        combined = combined[:packet_size]
        self._rx_buffers = [None] * 4
        if xor_checksum(combined):
            logger.warning("Invalid XOR checksum: %s", combined.hex())
            return
        self._rx_packet_type = bytes(combined[1:3])
        self._rx_address = bytes(combined[3:5])
        expected = combined[5]
        if self._rx_packet_type == bytes.fromhex("8f00"):
            self._rx_data = bytes(combined[6:7])
        elif expected > len(combined) - 8:
            self._rx_data = b"\xff" * expected
        else:
            self._rx_data = bytes(combined[6 : 6 + expected])
        self._rx_done.set()

    def _on_unlock(self, _characteristic, data: bytearray) -> None:
        self._unlock_data = bytes(data)
        self._unlock_done.set()

    async def enable_rx(self) -> None:
        if self._rx_notify_on:
            return
        self._map_rx_handles()
        for uuid in RX_CHANNEL_UUIDS:
            await self.client.start_notify(uuid, self._on_rx)
        self._rx_notify_on = True

    async def disable_rx(self) -> None:
        if not self._rx_notify_on:
            return
        for uuid in RX_CHANNEL_UUIDS:
            try:
                await self.client.stop_notify(uuid)
            except Exception:
                logger.debug("stop_notify %s failed", uuid, exc_info=True)
        self._rx_notify_on = False

    async def _wait_for_rx(self, command: bytes, *, timeout: float = 1.0) -> None:
        retries = 0
        while True:
            self._rx_done.clear()
            remaining = bytes(command)
            channel_width = 16
            needed = range((len(command) + channel_width - 1) // channel_width)
            for index in needed:
                chunk = remaining[:channel_width]
                remaining = remaining[channel_width:]
                await self.client.write_gatt_char(TX_CHANNEL_UUIDS[index], chunk)
            try:
                await asyncio.wait_for(self._rx_done.wait(), timeout=timeout)
                return
            except TimeoutError:
                retries += 1
                logger.warning("HEM-7530T command timed out, retry %s/5", retries)
                if retries >= 5:
                    raise TimeoutError("The HEM-7530T did not answer the command.") from None

    async def start_transmission(self) -> None:
        await self.enable_rx()
        await self._wait_for_rx(bytes.fromhex("0800000000100018"))
        if self._rx_packet_type != bytes.fromhex("8000"):
            raise ValueError(f"Unexpected start response: {self._rx_packet_type.hex()}")

    async def end_transmission(self) -> None:
        await self._wait_for_rx(bytes.fromhex("080f000000000007"))
        if self._rx_packet_type != bytes.fromhex("8f00"):
            raise ValueError(f"Unexpected end response: {self._rx_packet_type.hex()}")
        await self.disable_rx()

    async def _read_block(self, address: int, size: int) -> bytes:
        command = bytearray.fromhex("080100")
        command += address.to_bytes(2, "big")
        command.append(size)
        command.append(0x00)
        command.append(xor_checksum(command))
        await self._wait_for_rx(bytes(command))
        if self._rx_packet_type != bytes.fromhex("8100"):
            raise ValueError(f"Unexpected read response: {self._rx_packet_type.hex()}")
        if self._rx_address != address.to_bytes(2, "big"):
            raise ValueError("EEPROM address in the reply does not match the request.")
        return self._rx_data

    async def read_eeprom(self, start: int, length: int, block_size: int = TRANSMISSION_BLOCK_SIZE) -> bytes:
        data = bytearray()
        address = start
        remaining = length
        while remaining:
            chunk = min(remaining, block_size)
            data += await self._read_block(address, chunk)
            address += chunk
            remaining -= chunk
        return bytes(data)

    async def pair_unlock_key(self) -> None:
        await self.client.start_notify(RX_CHANNEL_UUIDS[0], lambda *_: None)
        await self.client.start_notify(UNLOCK_UUID, self._on_unlock)
        last = b""
        for attempt in range(20):
            self._unlock_done.clear()
            await self.client.write_gatt_char(UNLOCK_UUID, b"\x02" + b"\x00" * 16, response=True)
            try:
                await asyncio.wait_for(self._unlock_done.wait(), timeout=2.0)
            except TimeoutError:
                last = b""
                logger.info("HEM-7530T pairing attempt %s/20: no reply", attempt + 1)
                await asyncio.sleep(1.5)
                continue
            last = self._unlock_data
            status = last[:2].hex()
            logger.info("HEM-7530T pairing attempt %s/20: unlock=%s", attempt + 1, status)
            if last[:2] == bytes.fromhex("8200"):
                break
            await asyncio.sleep(1.5)
        else:
            raise ValueError(
                "Could not enter pairing-key programming mode. "
                "The display must show -P- at this moment. "
                f"Last reply: {last.hex() or 'none'}."
            )
        self._unlock_done.clear()
        await self.client.write_gatt_char(UNLOCK_UUID, b"\x00" + self.pairing_key, response=True)
        await asyncio.wait_for(self._unlock_done.wait(), timeout=3.0)
        if self._unlock_data[:2] != bytes.fromhex("8000"):
            raise ValueError(f"Failed to write pairing key: {self._unlock_data.hex()}")
        await self.client.stop_notify(UNLOCK_UUID)
        await self.client.stop_notify(RX_CHANNEL_UUIDS[0])

    async def unlock(self) -> None:
        await self.client.start_notify(UNLOCK_UUID, self._on_unlock)
        self._unlock_done.clear()
        await self.client.write_gatt_char(UNLOCK_UUID, b"\x01" + self.pairing_key, response=True)
        await asyncio.wait_for(self._unlock_done.wait(), timeout=3.0)
        if self._unlock_data[:2] != bytes.fromhex("8100"):
            raise ValueError(
                "The monitor rejected the pairing key. Check this computer's Bluetooth bond."
            )
        await self.client.stop_notify(UNLOCK_UUID)

    async def read_records(self) -> list[dict]:
        await self.unlock()
        await self.start_transmission()
        try:
            raw = await self.read_eeprom(
                USER_START_ADDRESS,
                RECORDS_PER_USER * RECORD_BYTE_SIZE,
                TRANSMISSION_BLOCK_SIZE,
            )
        finally:
            await self.end_transmission()
        records: list[dict] = []
        for offset in range(0, len(raw), RECORD_BYTE_SIZE):
            parsed = parse_hem7530_record(raw[offset : offset + RECORD_BYTE_SIZE])
            if parsed:
                records.append(parsed)
        return records
