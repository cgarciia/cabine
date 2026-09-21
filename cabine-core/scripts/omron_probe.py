"""Diagnóstico BLE do Omron Complete HEM-7530T1 (pressão + ECG).

Uso:
    uv run python scripts/omron_probe.py
    uv run python scripts/omron_probe.py AA:BB:CC:DD:EE:FF
    uv run python scripts/omron_probe.py AA:BB:CC:DD:EE:FF --pair
    uv run python scripts/omron_probe.py AA:BB:CC:DD:EE:FF --read

Passos no aparelho (manual IM1-HEM-7530T):
  1. Feche o app OMRON connect no celular (ele segura o rádio).
  2. Bluetooth do monitor ligado (não pode aparecer o ícone de BT desligado).
  3. Primeira vez neste PC: segure o botão Bluetooth até o display piscar -P-.
  4. Rode com --pair e aceite o pareamento na notificação do Windows.
  5. Depois: meça a pressão, deixe o monitor transferir (símbolo BT) e rode --read.

ECG: o Complete manda o traçado por tom ultrassônico (~19 kHz) para o microfone
do celular (AliveCor). Não chega no GATT. Esta sonda só cobre as medições de PA
gravadas na EEPROM (até 90 registros).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bleak import BleakClient, BleakError, BleakScanner

from app.services.ble import apply_winrt_descriptor_tolerance
from app.services.omron.ble import name_looks_like_omron, scan_omron
from app.services.omron.protocol import (
    PARENT_SERVICE_UUID,
    RX_CHANNEL_UUIDS,
    TX_CHANNEL_UUIDS,
    UNLOCK_UUID,
    OmronSession,
)


apply_winrt_descriptor_tolerance()


def ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


def dump_advertisement(device, advertisement) -> None:
    mfg = {cid: bytes(data).hex() for cid, data in (advertisement.manufacturer_data or {}).items()}
    svc = {str(uid): bytes(data).hex() for uid, data in (advertisement.service_data or {}).items()}
    print(f"[{ts()}] {device.address}  name={device.name!r}  rssi={getattr(advertisement, 'rssi', None)}")
    print(f"         local_name={advertisement.local_name!r}")
    print(f"         manufacturer_data={mfg or '{}'}")
    print(f"         service_data={svc or '{}'}")
    print(f"         service_uuids={list(advertisement.service_uuids or [])}")


async def pick_device(address: str | None, scan_seconds: float):
    if address:
        mac = address.strip().upper().replace("-", ":")
        print(f"[{ts()}] Procurando {mac} por {scan_seconds:.0f}s...")
        device = await BleakScanner.find_device_by_address(mac, timeout=scan_seconds)
        if device is None:
            print("MAC não encontrado. Ligue o monitor ou dispare a transferência Bluetooth.")
        return device

    print(f"[{ts()}] Varrendo BLE por {scan_seconds:.0f}s (nomes Omron/Complete/BLESmart)...")
    matches = await scan_omron(timeout=scan_seconds)
    if matches:
        for device, advertisement in matches:
            dump_advertisement(device, advertisement)
        return matches[0][0]

    print("Nenhum nome conhecido. Dispositivos vistos:")
    devices = await BleakScanner.discover(timeout=8.0, return_adv=True)
    for _mac, (device, advertisement) in devices.items():
        print(f"  {device.address}  {device.name or '(sem nome)'}  rssi={getattr(advertisement, 'rssi', None)}")
    return None


async def dump_gatt(client: BleakClient) -> None:
    print(f"\n[{ts()}] Serviços GATT:")
    omron_chars = 0
    for service in client.services:
        marker = "  << Omron legado" if service.uuid.lower() == PARENT_SERVICE_UUID else ""
        print(f"  svc {service.uuid} {service.description}{marker}")
        for char in service.characteristics:
            props = ",".join(char.properties)
            known = ""
            uid = char.uuid.lower()
            if uid in RX_CHANNEL_UUIDS:
                known = "  RX"
            elif uid in TX_CHANNEL_UUIDS:
                known = "  TX"
            elif uid == UNLOCK_UUID:
                known = "  UNLOCK"
            if known:
                omron_chars += 1
            print(f"    char {char.uuid} [{props}]{known}")
            if "read" in char.properties:
                try:
                    value = await client.read_gatt_char(char.uuid)
                    print(f"      READ hex={value.hex()}")
                except BleakError as exc:
                    print(f"      READ falhou: {exc}")
    if omron_chars:
        print(f"[{ts()}] Características do protocolo Omron encontradas: {omron_chars}")
    else:
        print(
            f"[{ts()}] Serviço {PARENT_SERVICE_UUID} / canais RX-TX-UNLOCK não apareceram. "
            "Pode ser outro firmware, pairing incompleto, ou o Windows escondeu o serviço."
        )


async def listen_all_notify(client: BleakClient, seconds: float) -> int:
    count = 0

    def make_handler(uuid: str):
        def handler(_sender, data: bytearray) -> None:
            nonlocal count
            count += 1
            print(f"[{ts()}] NOTIFY {uuid} ({len(data)} B)  {data.hex()}")

        return handler

    subscribed: list[str] = []
    for service in client.services:
        for char in service.characteristics:
            if "notify" in char.properties or "indicate" in char.properties:
                try:
                    await client.start_notify(char.uuid, make_handler(char.uuid))
                    subscribed.append(char.uuid)
                    print(f"    NOTIFY inscrito {char.uuid}")
                except BleakError as exc:
                    print(f"    NOTIFY falhou {char.uuid}: {exc}")
    print(f"[{ts()}] Aguardando {seconds:.0f}s de notificações soltas...")
    await asyncio.sleep(seconds)
    for uuid in subscribed:
        try:
            await client.stop_notify(uuid)
        except BleakError:
            pass
    return count


async def main() -> int:
    parser = argparse.ArgumentParser(description="Probe BLE Omron Complete HEM-7530T")
    parser.add_argument("address", nargs="?", help="MAC AA:BB:CC:DD:EE:FF")
    parser.add_argument("--scan", type=float, default=15.0)
    parser.add_argument("--listen", type=float, default=12.0, help="Segundos ouvindo notify após o dump GATT")
    parser.add_argument("--pair", action="store_true", help="Parear (modo -P-) e gravar chave EEPROM")
    parser.add_argument("--read", action="store_true", help="Desbloquear e ler registros de PA")
    parser.add_argument("--skip-gatt", action="store_true")
    args = parser.parse_args()

    device = await pick_device(args.address, args.scan)
    if device is None:
        return 1

    print(f"\n[{ts()}] Conectando em {device.name} ({device.address})...")
    try:
        async with BleakClient(device, timeout=30.0) as client:
            print(f"[{ts()}] Conectado is_connected={client.is_connected}")
            if not args.skip_gatt:
                await dump_gatt(client)

            session = OmronSession(client)
            if args.pair:
                print(f"\n[{ts()}] Pareamento: olhe a barra do Windows e clique em Conectar/Parear se aparecer.")
                print("O display do monitor precisa estar em -P- agora.")
                try:
                    paired = await asyncio.wait_for(client.pair(), timeout=8.0)
                    print(f"[{ts()}] client.pair() -> {paired}")
                except Exception as exc:
                    print(
                        f"[{ts()}] pairing OS: {type(exc).__name__}: {exc} "
                        "(seguindo; o Windows às vezes já iniciou sozinho)"
                    )
                await asyncio.sleep(3)
                await session.pair_unlock_key()
                print(f"[{ts()}] Chave gravada. Nas próximas vezes use --read sem --pair.")

            if args.read:
                print(f"\n[{ts()}] Lendo EEPROM de pressão (HEM-7530T, até 90 registros)...")
                records = await session.read_hem7530_records()
                if not records:
                    print("Nenhum registro válido. Faça uma medição de PA e tente de novo.")
                for item in records:
                    stamp = item["measured_at"].strftime("%Y-%m-%d %H:%M:%S")
                    flags = []
                    if item["movement"]:
                        flags.append("movimento")
                    if item["irregular_heartbeat"]:
                        flags.append("IHB")
                    extra = f"  ({', '.join(flags)})" if flags else ""
                    print(
                        f"  {stamp}  SYS {item['sys_mmhg']}  DIA {item['dia_mmhg']}  "
                        f"PR {item['pulse_bpm']}{extra}"
                    )
                print(f"Total: {len(records)}")

            if not args.pair and not args.read and not args.skip_gatt:
                n = await listen_all_notify(client, args.listen)
                print(f"\n[{ts()}] Notificações soltas: {n}")
                if n == 0:
                    print(
                        "Sem notify espontâneo: o Complete não transmite PA em streaming. "
                        "Use --pair (primeira vez) e depois --read."
                    )
                if not name_looks_like_omron(device.name):
                    print("Nome fora da lista de hints; confirme se é mesmo o HEM-7530T.")
    except Exception as exc:
        print(f"[{ts()}] Falha: {type(exc).__name__}: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
