import asyncio

from bleak import BleakScanner
from fastapi import WebSocket

from app.services.scale.adapters.base import DispatchFn, ScaleAdapter, StatusFn
from app.services.scale.adapters.ble_common import (
    ble_radio_lock,
    normalize_mac,
    watch_websocket_closed,
)
from app.services.scale.parsers import ParserFn
from app.services.scale.reading import ScaleReading
from app.services.scale.spec import ScaleSpec


class BleBroadcastAdapter(ScaleAdapter):
    key = "ble_broadcast"
    label = "BLE broadcast (transmissão passiva)"
    address_kind = "mac"
    address_label = "Endereço MAC"
    parsers = ("broadcast_big_endian",)

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
        profile=None,
        profile_box=None,
        profile_sync_box=None,
    ) -> None:
        def scan_callback(ble_device, adv) -> None:
            if ble_device.address.upper() == spec.address:
                result = parse(adv.manufacturer_data)
                if result is not None:
                    dispatch(ScaleReading(peso_kg=float(result)))

        async with ble_radio_lock:
            scanner = BleakScanner(detection_callback=scan_callback)
            await scanner.start()
            websocket_closed_task = asyncio.create_task(watch_websocket_closed(websocket))
            try:
                await send_status("Modo broadcast ativo. Procurando sinal...")
                while not websocket_closed_task.done():
                    queue_task = asyncio.create_task(queue.get())
                    done, pending = await asyncio.wait(
                        {queue_task, websocket_closed_task},
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    if websocket_closed_task in done:
                        queue_task.cancel()
                        try:
                            await queue_task
                        except asyncio.CancelledError:
                            pass
                        break
                    data = queue_task.result()
                    await websocket.send_json(data)
            finally:
                if not websocket_closed_task.done():
                    websocket_closed_task.cancel()
                    try:
                        await websocket_closed_task
                    except asyncio.CancelledError:
                        pass
                await scanner.stop()
