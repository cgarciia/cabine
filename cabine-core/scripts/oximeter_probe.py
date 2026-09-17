"""Diagnóstico BLE do oxímetro Creative PC-60NW.

Uso:
    uv run python scripts/oximeter_probe.py
    uv run python scripts/oximeter_probe.py 40:00:05:A5:62:EE --seconds 40

Ligue o oxímetro, Wireless=on, dedo no sensor. Feche o app da Creative no celular.
O PC-60NW usa FFF0/FFF1/FFF2: sem write em FFF2 ele costuma não enviar nada.
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime

from bleak import BleakClient, BleakScanner

from app.services.oximeter.ble import (
    FFF1_NOTIFY,
    keep_alive_stream,
    start_commands,
    subscribe_notifications,
    write_start_stream,
)
from app.services.oximeter.parsers import CreativeFrameBuffer


def ts() -> str:
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def looks_like_oximeter(name: str | None) -> bool:
    if not name:
        return False
    text = name.lower()
    return any(
        token in text
        for token in (
            "pc-60",
            "pc60",
            "oxysmart",
            "creative",
            "oximeter",
            "spo2",
            "wellue",
            "viatom",
            "lepu",
            "berry",
            "ichoice",
        )
    )


async def pick_device(address: str | None):
    if address:
        device = await BleakScanner.find_device_by_address(address, timeout=20.0)
        if device is None:
            print(f"[{ts()}] MAC {address} não encontrado.")
        return device

    print(f"[{ts()}] Varrendo BLE por 12s...")
    devices = await BleakScanner.discover(timeout=12.0)
    matches = [item for item in devices if looks_like_oximeter(item.name)]
    if not matches:
        print("Nenhum nome conhecido. Dispositivos vistos:")
        for item in devices:
            print(f"  {item.address}  {item.name or '(sem nome)'}")
        return None
    for item in matches:
        print(f"  candidato: {item.address}  {item.name}")
    return matches[0]


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("address", nargs="?", help="MAC AA:BB:CC:DD:EE:FF")
    parser.add_argument("--seconds", type=int, default=40)
    args = parser.parse_args()

    device = await pick_device(args.address)
    if device is None:
        return 1

    print(f"[{ts()}] Conectando em {device.name} ({device.address})...")
    client = BleakClient(device, timeout=30.0)
    await client.connect()
    print(f"[{ts()}] Serviços:")
    for service in client.services:
        print(f"  svc {service.uuid} {service.description}")
        for char in service.characteristics:
            print(f"    char {char.uuid} {char.properties} {char.description}")

    buffer = CreativeFrameBuffer()
    got = {"n": 0}

    def on_notify(sender, data: bytearray) -> None:
        got["n"] += 1
        hexa = " ".join(f"{byte:02X}" for byte in data)
        print(f"[{ts()}] NOTIFY {sender} ({len(data)} B)  {hexa}")
        for sample in buffer.feed(bytes(data)):
            print(
                f"[{ts()}] PARSE spo2={sample.spo2_pct} pr={sample.pulse_bpm} "
                f"pi={sample.pi_pct} finger={sample.finger_on}"
            )

    print(f"[{ts()}] Assinando FFF1 e enviando handshake FFF2...")
    subscribed = await subscribe_notifications(client, on_notify)
    print(f"[{ts()}] canais notify={subscribed}  FFF1 presente={client.services.get_characteristic(FFF1_NOTIFY) is not None}")
    extra = await write_start_stream(client, all_candidates=True)
    print(f"[{ts()}] writes extras={extra}")
    print("Comandos tentados:")
    for label, payload in start_commands():
        print(f"  {label}: {payload.hex(' ')}")

    keepalive = asyncio.create_task(keep_alive_stream(client))
    print(f"[{ts()}] Aguardando {args.seconds}s. Mantenha o dedo no sensor.")
    await asyncio.sleep(args.seconds)
    keepalive.cancel()
    try:
        await keepalive
    except asyncio.CancelledError:
        pass
    await client.disconnect()
    print(f"[{ts()}] Fim. Pacotes recebidos: {got['n']}")
    if got["n"] == 0:
        print(
            "Nada chegou em FFF1. Confira Wireless=on, dedo no sensor, "
            "app da Creative fechado, e tente de novo."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
