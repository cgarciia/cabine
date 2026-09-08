from bleak import BleakScanner
from fastapi import WebSocket

from app.services.scale.adapters.base import DispatchFn, ScaleAdapter, StatusFn
from app.services.scale.adapters.ble_common import normalize_mac
from app.services.scale.parsers import ParserFn
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
    ) -> None:
        def scan_callback(ble_device, adv) -> None:
            if ble_device.address.upper() == spec.address:
                dispatch(parse(adv.manufacturer_data))

        scanner = BleakScanner(detection_callback=scan_callback)
        await scanner.start()
        try:
            await send_status("Modo broadcast ativo. Procurando sinal...")
            while True:
                data = await queue.get()
                await websocket.send_json(data)
        finally:
            await scanner.stop()
