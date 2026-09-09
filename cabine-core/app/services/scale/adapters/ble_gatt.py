import asyncio
import logging
import sys

from bleak import BleakClient, BleakError, BleakScanner
from fastapi import WebSocket

from app.services.scale.adapters.base import DispatchFn, ScaleAdapter, StatusFn
from app.services.scale.adapters.ble_common import (
    ble_radio_lock,
    normalize_mac,
    watch_websocket_closed,
)
from app.services.scale.adapters.ble_winrt_patch import apply_winrt_descriptor_tolerance
from app.services.scale.parsers import ParserFn
from app.services.scale.spec import ScaleSpec

logger = logging.getLogger(__name__)

apply_winrt_descriptor_tolerance()

PRIMARY_SERVICE_UUIDS = (
    "0000fff0-0000-1000-8000-00805f9b34fb",
    "0000181d-0000-1000-8000-00805f9b34fb",
)

PREFERRED_NOTIFY_UUIDS = (
    "0000fff1-0000-1000-8000-00805f9b34fb",
    "00002a9d-0000-1000-8000-00805f9b34fb",
)

def _service_count(client: BleakClient) -> int:
    try:
        return len(list(client.services))
    except Exception:
        return 0

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
        await send_status("Aguardando rádio Bluetooth...")
        async with ble_radio_lock:
            await send_status("Procurando balança BLE...")
            device = await BleakScanner.find_device_by_address(spec.address, timeout=20.0)
            if device is None:
                await send_status(
                    f"Balança {spec.address} não encontrada. "
                    "Ligue a balança e tente novamente."
                )
                return

            await send_status("Conectando via GATT...")
            client = await self._connect(device)

            try:
                async def notify_handler(_sender, data) -> None:
                    dispatch(parse(bytearray(data)))

                await send_status("Conexão GATT estabelecida. Assinando notificações...")
                subscribed = await self._subscribe_notifications(client, notify_handler)
                if subscribed == 0:
                    await send_status(
                        "Nenhuma característica de notificação disponível nesta balança."
                    )
                    return

                await send_status("Subscrição concluída. Aguardando peso.")
                consumer = asyncio.create_task(_consume_queue(websocket, queue))
                closed = asyncio.create_task(watch_websocket_closed(websocket))
                try:
                    while client.is_connected and not closed.done():
                        await asyncio.sleep(0.5)
                finally:
                    if not closed.done():
                        closed.cancel()
                    consumer.cancel()
                    for task in (closed, consumer):
                        try:
                            await task
                        except asyncio.CancelledError:
                            pass
            finally:
                try:
                    await client.disconnect()
                except Exception:
                    logger.debug("Falha ao desconectar GATT (ignorada).", exc_info=True)

    async def _connect(self, device) -> BleakClient:
        attempts: list[dict] = []
        if sys.platform == "win32":
            attempts = [
                {
                    "services": list(PRIMARY_SERVICE_UUIDS),
                    "winrt": {"use_cached_services": True},
                },
                {
                    "services": list(PRIMARY_SERVICE_UUIDS),
                    "winrt": {"use_cached_services": False},
                },
                {"services": list(PRIMARY_SERVICE_UUIDS)},
                {"winrt": {"use_cached_services": True}},
                {},
            ]
        else:
            attempts = [
                {"services": list(PRIMARY_SERVICE_UUIDS)},
                {},
            ]

        errors: list[str] = []
        for kwargs in attempts:
            client = BleakClient(device, timeout=30.0, **kwargs)
            try:
                await client.connect()
                if kwargs.get("services") and _service_count(client) == 0:
                    raise BleakError("Nenhum dos serviços GATT esperados foi encontrado.")
                logger.info("GATT conectado com opções %s", kwargs or "default")
                return client
            except Exception as exc:
                errors.append(f"{kwargs or 'default'}: {exc}")
                logger.warning("Tentativa GATT falhou (%s): %s", kwargs or "default", exc)
                try:
                    await client.disconnect()
                except Exception:
                    pass
                await asyncio.sleep(0.4)

        raise BleakError(
            "Não foi possível completar a conexão GATT. "
            + (errors[-1] if errors else "erro desconhecido")
        )

    async def _subscribe_notifications(self, client: BleakClient, notify_handler) -> int:
        subscribed = 0

        for char_uuid in PREFERRED_NOTIFY_UUIDS:
            char = client.services.get_characteristic(char_uuid)
            if char is None:
                continue
            if "notify" not in char.properties and "indicate" not in char.properties:
                continue
            try:
                await client.start_notify(char.uuid, notify_handler)
                subscribed += 1
                logger.info("Notify ativo em %s", char.uuid)
            except BleakError as exc:
                logger.debug("Notify falhou em %s: %s", char_uuid, exc)

        if subscribed:
            return subscribed

        for service in client.services:
            svc_uuid = str(service.uuid).lower()
            if "fff0" not in svc_uuid and "181d" not in svc_uuid:
                continue
            for char in service.characteristics:
                if "notify" not in char.properties and "indicate" not in char.properties:
                    continue
                try:
                    await client.start_notify(char.uuid, notify_handler)
                    subscribed += 1
                    logger.info("Notify ativo (fallback) em %s", char.uuid)
                except BleakError:
                    logger.debug("Canal BLE protegido ignorado: %s", char.uuid)

        if subscribed:
            return subscribed

        for service in client.services:
            for char in service.characteristics:
                if "notify" not in char.properties and "indicate" not in char.properties:
                    continue
                try:
                    await client.start_notify(char.uuid, notify_handler)
                    subscribed += 1
                except BleakError:
                    logger.debug("Canal BLE protegido ignorado: %s", char.uuid)

        return subscribed


async def _consume_queue(websocket: WebSocket, queue: asyncio.Queue) -> None:
    while True:
        data = await queue.get()
        await websocket.send_json(data)
