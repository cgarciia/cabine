import asyncio
import logging

from bleak import BleakClient, BleakError
from fastapi import WebSocket

from app.services.scale.adapters.base import DispatchFn, ScaleAdapter, StatusFn
from app.services.scale.adapters.ble_common import normalize_mac
from app.services.scale.parsers import ParserFn
from app.services.scale.spec import ScaleSpec

logger = logging.getLogger(__name__)


class BleGattAdapter(ScaleAdapter):
    key = "ble_gatt"
    label = "BLE GATT (conexão ativa)"
    address_kind = "mac"
    address_label = "Endereço MAC"
    parsers = ("gatt_16bit_overflow",)

    def normalize_address(self, address: str) -> str:
        return normalize_mac(address)

    async def run(
        self,
        websocket: WebSocket,
        spec: ScaleSpec,
        parse: ParserFn,
        dispatch: DispatchFn,
        send_status: StatusFn,
        queue,
    ) -> None:
        async def notify_handler(_sender, data) -> None:
            dispatch(parse(data))

        async with BleakClient(spec.address) as client:
            await send_status("Conexão GATT estabelecida. Mapeando serviços...")

            for service in client.services:
                for char in service.characteristics:
                    if "notify" in char.properties or "indicate" in char.properties:
                        try:
                            await client.start_notify(char.uuid, notify_handler)
                        except BleakError:
                            logger.debug("Canal BLE protegido ignorado: %s", char.uuid)

            await send_status("Subscrição concluída. Aguardando peso.")

            consumer = asyncio.create_task(_consume_queue(websocket, queue))
            try:
                while client.is_connected:
                    await asyncio.sleep(1)
            finally:
                consumer.cancel()
                try:
                    await consumer
                except asyncio.CancelledError:
                    pass


async def _consume_queue(websocket: WebSocket, queue: asyncio.Queue) -> None:
    while True:
        data = await queue.get()
        await websocket.send_json(data)
