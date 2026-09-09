"""Sonda uma balança BLE: advertising (broadcast) e conexão GATT.

Uso:
  uv run python scripts/probe_scale.py 60:65:F4:CA:05:77
  uv run python scripts/probe_scale.py 60:65:F4:CA:05:77 --scan 20 --gatt 40
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime

from bleak import BleakClient, BleakError, BleakScanner


def ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


def normalize_mac(address: str) -> str:
    return address.strip().upper().replace("-", ":")


async def probe_broadcast(mac: str, seconds: float) -> dict:
    print(f"\n=== 1) BROADCAST / advertising ({seconds:.0f}s) ===")
    print("Ligue a balança e, se possível, suba nela. Feche o app RelaxFit no celular.\n")

    hits = 0
    last_sig: str | None = None
    sample: dict | None = None

    def on_detect(device, adv) -> None:
        nonlocal hits, last_sig, sample
        if device.address.upper() != mac:
            return
        hits += 1
        mfg = {cid: bytes(data).hex() for cid, data in (adv.manufacturer_data or {}).items()}
        svc = {str(uid): bytes(data).hex() for uid, data in (adv.service_data or {}).items()}
        sig = f"{device.name}|{mfg}|{svc}|{adv.rssi}"
        if sig == last_sig:
            return
        last_sig = sig
        sample = {
            "name": device.name,
            "rssi": adv.rssi,
            "manufacturer_data": mfg,
            "service_data": svc,
            "service_uuids": list(adv.service_uuids or []),
            "local_name": adv.local_name,
        }
        print(f"[{ts()}] hit #{hits} name={device.name!r} rssi={adv.rssi}")
        print(f"         manufacturer_data={mfg or '{}'}")
        print(f"         service_data={svc or '{}'}")
        print(f"         service_uuids={sample['service_uuids']}")

    scanner = BleakScanner(detection_callback=on_detect)
    await scanner.start()
    try:
        await asyncio.sleep(seconds)
    finally:
        await scanner.stop()

    if hits == 0:
        print("Nenhum advertising deste MAC. A balança pode estar desligada ou fora de alcance.")
    else:
        print(f"Total de detecções: {hits}")
    return {"hits": hits, "sample": sample}


async def probe_gatt(mac: str, seconds: float) -> dict:
    print(f"\n=== 2) GATT / conexão ({seconds:.0f}s) ===")
    print("Mantendo conexão; pise na balança e segure a barra se quiser composição.\n")

    notifications: list[dict] = []
    services_dump: list[dict] = []

    try:
        async with BleakClient(mac, timeout=20.0) as client:
            print(f"[{ts()}] Conectado. is_connected={client.is_connected}")

            for service in client.services:
                svc_info = {"uuid": service.uuid, "description": service.description, "chars": []}
                print(f"\nService {service.uuid} ({service.description})")
                for char in service.characteristics:
                    props = ",".join(char.properties)
                    print(f"  Char {char.uuid} props=[{props}]")
                    svc_info["chars"].append({"uuid": char.uuid, "properties": list(char.properties)})

                    if "read" in char.properties:
                        try:
                            value = await client.read_gatt_char(char.uuid)
                            print(f"    READ hex={value.hex()}")
                        except BleakError as exc:
                            print(f"    READ falhou: {exc}")

                    if "notify" in char.properties or "indicate" in char.properties:

                        def make_handler(uuid: str):
                            def handler(_sender, data: bytearray) -> None:
                                entry = {
                                    "uuid": uuid,
                                    "hex": data.hex(),
                                    "len": len(data),
                                    "at": ts(),
                                }
                                notifications.append(entry)
                                print(
                                    f"[{entry['at']}] NOTIFY {uuid} len={entry['len']} hex={entry['hex']}"
                                )
                                if data.hex().startswith("ac27"):
                                    print("         -> parece pacote Yolanda/AC27 (parser gatt atual)")

                            return handler

                        try:
                            await client.start_notify(char.uuid, make_handler(char.uuid))
                            print("    NOTIFY inscrito")
                        except BleakError as exc:
                            print(f"    NOTIFY falhou: {exc}")

                services_dump.append(svc_info)

            print(f"\n[{ts()}] Aguardando notificações por {seconds:.0f}s...")
            await asyncio.sleep(seconds)
    except Exception as exc:
        print(f"[{ts()}] Falha GATT: {type(exc).__name__}: {exc}")
        return {"connected": False, "error": str(exc), "services": [], "notifications": []}

    print(f"\nNotificações recebidas: {len(notifications)}")
    return {
        "connected": True,
        "services": services_dump,
        "notifications": notifications,
    }


def summarize(broadcast: dict, gatt: dict) -> None:
    print("\n=== RESUMO ===")
    b_ok = broadcast.get("hits", 0) > 0
    g_ok = bool(gatt.get("connected"))
    n_ok = len(gatt.get("notifications") or []) > 0

    if b_ok and not g_ok:
        print("Provável modo: ble_broadcast (só advertising).")
    elif g_ok and n_ok:
        print("Provável modo: ble_gatt (conexão + notify).")
        sample = (gatt.get("notifications") or [{}])[0].get("hex", "")
        if sample.startswith("ac27"):
            print("Parser candidato: gatt_16bit_overflow (já existe na Cabine).")
        else:
            print("Parser novo necessário: hex não casa com AC27 da POC.")
    elif g_ok and not n_ok:
        print("GATT conecta, mas não houve notify. Pode precisar de comando write ou perfil no app.")
    elif b_ok and g_ok:
        print("Responde nos dois. Preferir o caminho que trouxe peso estável.")
    else:
        print("Sem sinal útil. Confira: balança ligada, app fechado, Bluetooth do PC ativo, proximidade.")

    print("\nPróximo passo na Cabine: cadastrar com o adapter indicado e, se o hex for novo, criar parser.")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Probe BLE de balança")
    parser.add_argument("mac", help="MAC AA:BB:CC:DD:EE:FF")
    parser.add_argument("--scan", type=float, default=15.0, help="Segundos de scan broadcast")
    parser.add_argument("--gatt", type=float, default=30.0, help="Segundos ouvindo GATT notify")
    parser.add_argument("--skip-gatt", action="store_true")
    parser.add_argument("--skip-broadcast", action="store_true")
    args = parser.parse_args()

    mac = normalize_mac(args.mac)
    print(f"Alvo: {mac}")

    broadcast: dict = {"hits": 0, "sample": None}
    gatt: dict = {"connected": False, "services": [], "notifications": []}

    if not args.skip_broadcast:
        broadcast = await probe_broadcast(mac, args.scan)
    if not args.skip_gatt:
        gatt = await probe_gatt(mac, args.gatt)

    summarize(broadcast, gatt)


if __name__ == "__main__":
    asyncio.run(main())
