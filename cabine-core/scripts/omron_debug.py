"""Debug BLE do Omron Complete (HEM-7530T1).

Mostra o que o Windows vê, se o MAC aparece, se o GATT abre, se 0x2A35
indica algo, e se a EEPROM Omron responde.

Uso (pasta cabine-core):

    uv run python scripts/omron_debug.py
    uv run python scripts/omron_debug.py --seconds 90
    uv run python scripts/omron_debug.py 00:5F:BF:08:0A:BF --seconds 120

Enquanto o script estiver "OUVINDO": meça no Complete (manguito + sensores).
Feche o OMRON connect no celular e a tela de pressão do totem (eles pegam o rádio).

O log também vai para scripts/omron_debug.log
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

from app.core.config import settings
from app.services.ble import apply_winrt_descriptor_tolerance
from app.services.omron.ble import advertisement_looks_like_omron
from app.services.omron.gatt_bp import BP_MEASUREMENT_UUID, LIVE_NOTIFY_UUID, parse_bp_measurement
from app.services.omron.hem7530 import pick_latest_record
from app.services.omron.protocol import OmronSession

apply_winrt_descriptor_tolerance()

LOG_PATH = Path(__file__).resolve().parent / "omron_debug.log"
DEFAULT_MAC = (settings.OMRON_ADDRESS or "00:5F:BF:08:0A:BF").strip().upper()


def ts() -> str:
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]


def log(message: str) -> None:
    line = f"[{ts()}] {message}"
    print(line, flush=True)
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def hexdump(data: bytes | bytearray) -> str:
    return bytes(data).hex(" ")


async def phase_scan(mac: str, seconds: float) -> object | None:
    log(f"=== 1) SCAN {seconds:.0f}s  alvo={mac} ===")
    log("Meça agora ou deixe o Complete acordar. Listo TODOS os BLE, não só Omron.")
    hits_target = 0
    hits_omron = 0
    last_all: dict[str, str] = {}
    found_device = None

    def on_detect(device, advertisement) -> None:
        nonlocal hits_target, hits_omron, found_device
        address = (device.address or "").upper()
        name = device.name or advertisement.local_name
        rssi = getattr(advertisement, "rssi", None)
        mfg = {cid: bytes(blob).hex() for cid, blob in (advertisement.manufacturer_data or {}).items()}
        uuids = list(advertisement.service_uuids or [])
        sig = f"{name}|{rssi}|{mfg}|{uuids}"
        is_target = address == mac
        is_omron = advertisement_looks_like_omron(advertisement, name)
        if is_target:
            hits_target += 1
            found_device = device
            log(f"ALVO  {address}  name={name!r}  rssi={rssi}  mfg={mfg}  uuids={uuids}")
            return
        if is_omron:
            hits_omron += 1
            log(f"OMRON {address}  name={name!r}  rssi={rssi}  mfg={mfg}  uuids={uuids}")
            if found_device is None:
                found_device = device
            return
        if last_all.get(address) == sig:
            return
        last_all[address] = sig
        log(f"outro {address}  name={name!r}  rssi={rssi}")

    scanner = BleakScanner(detection_callback=on_detect)
    await scanner.start()
    try:
        await asyncio.sleep(seconds)
    finally:
        await scanner.stop()

    log(f"Scan fim. hits_alvo={hits_target}  hits_omron_outros={hits_omron}  outros_unicos={len(last_all)}")
    if hits_target == 0:
        log("O MAC pareado NÃO anunciou. Sem advertising o Windows em geral não conecta.")
        log("Isso explica a tela parada: o Complete só acorda o BLE depois da medição (ou no -P-).")
    return found_device


async def phase_connect(mac: str, device) -> BleakClient | None:
    log("=== 2) CONEXÃO GATT ===")
    targets = []
    if device is not None:
        targets.append(("objeto_scan", device))
    targets.append(("mac_direto", mac))

    last_error = None
    for label, target in targets:
        log(f"Tentando connect via {label}…")
        client = BleakClient(target, timeout=20.0)
        try:
            await client.connect()
            log(f"Conectado is_connected={client.is_connected}  mtu={getattr(client, 'mtu_size', '?')}")
            try:
                paired = await client.pair()
                log(f"client.pair() -> {paired}")
            except Exception as exc:
                log(f"client.pair() falhou (ok se já houver bond): {type(exc).__name__}: {exc}")
            return client
        except Exception as exc:
            last_error = exc
            log(f"Falha {label}: {type(exc).__name__}: {exc}")
            try:
                await client.disconnect()
            except Exception:
                pass
    log(f"Não conectou. Último erro: {last_error}")
    return None


async def phase_gatt(client: BleakClient) -> None:
    log("=== 3) MAPA GATT ===")
    for service in client.services:
        log(f"svc {service.uuid}  {service.description}")
        for char in service.characteristics:
            props = ",".join(char.properties)
            mark = ""
            uid = char.uuid.lower()
            if uid == BP_MEASUREMENT_UUID:
                mark = "  << 0x2A35 BP (app Omron)"
            elif uid == LIVE_NOTIFY_UUID:
                mark = "  << notify extra Complete"
            log(f"  char {char.uuid} [{props}]{mark}")
            if "read" in char.properties:
                try:
                    value = await client.read_gatt_char(char.uuid)
                    decoded = ""
                    try:
                        text = bytes(value).decode("ascii")
                        if text.isprintable():
                            decoded = f"  ascii={text!r}"
                    except Exception:
                        pass
                    log(f"    READ {hexdump(value)}{decoded}")
                except BleakError as exc:
                    log(f"    READ falhou: {exc}")


async def phase_listen(client: BleakClient, seconds: float) -> dict[str, int]:
    log(f"=== 4) NOTIFY/INDICATE {seconds:.0f}s ===")
    log("Meça agora se ainda não mediu. Qualquer pacote aparece abaixo.")
    counts: dict[str, int] = {}

    def make_handler(uuid: str):
        def handler(_sender, data: bytearray) -> None:
            counts[uuid] = counts.get(uuid, 0) + 1
            log(f"NOTIFY {uuid} ({len(data)} B)  {hexdump(data)}")
            if uuid.lower() == BP_MEASUREMENT_UUID:
                parsed = parse_bp_measurement(bytes(data))
                log(f"  parse 2A35 -> {parsed}")

        return handler

    subscribed: list[str] = []
    for service in client.services:
        for char in service.characteristics:
            if "notify" not in char.properties and "indicate" not in char.properties:
                continue
            try:
                await client.start_notify(char.uuid, make_handler(char.uuid))
                subscribed.append(char.uuid)
                log(f"inscrito {char.uuid} props={char.properties}")
            except Exception as exc:
                log(f"NÃO inscrito {char.uuid}: {type(exc).__name__}: {exc}")

    if not subscribed:
        log("Nenhum canal notify/indicate inscrito.")
    await asyncio.sleep(seconds)
    for uuid in subscribed:
        try:
            await client.stop_notify(uuid)
        except Exception:
            pass
    log(f"Notify por UUID: {counts or '{}'}")
    return counts


async def phase_eeprom(client: BleakClient) -> None:
    log("=== 5) EEPROM Omron (protocolo legado / omblepy) ===")
    session = OmronSession(client)
    try:
        records = await session.read_hem7530_records()
    except Exception as exc:
        log(f"EEPROM falhou: {type(exc).__name__}: {exc}")
        log("Se a chave foi recusada, o bond/unlock não está valendo nesta conexão.")
        return
    log(f"Registros válidos na memória: {len(records)}")
    for item in records[-8:]:
        stamp = item["measured_at"].strftime("%Y-%m-%d %H:%M:%S")
        log(
            f"  {stamp}  SYS {item['sys_mmhg']}  DIA {item['dia_mmhg']}  "
            f"PR {item['pulse_bpm']}  mov={item['movement']} ihb={item['irregular_heartbeat']}"
        )
    latest = pick_latest_record(records)
    if latest:
        age = datetime.now() - latest["measured_at"].replace(tzinfo=None)
        log(f"Mais recente: {latest['measured_at']}  (idade ~ {age})")
        log("A tela do totem SÓ aceita medição com menos de ~8 min. Medição velha = nada na UI.")


def summarize(saw_adv: bool, connected: bool, notify_counts: dict[str, int]) -> None:
    log("=== RESUMO ===")
    if not saw_adv and not connected:
        log("Causa mais provável: o Complete não anunciou BLE. Ele dorme; só acorda ao medir ou no -P-.")
    elif connected and not notify_counts:
        log("GATT abriu, mas 0x2A35 não mandou indicação. O app Omron espera essa indicação após a medição.")
        log("Se a EEPROM leu dados, o protocolo legado funciona; a UI pode ter ignorado por não ser 'fresco'.")
    elif notify_counts.get(BP_MEASUREMENT_UUID) or notify_counts.get(BP_MEASUREMENT_UUID.lower()):
        log("0x2A35 falou. O caminho do OMRON connect está vivo neste PC.")
    else:
        log("Houve notify em outros UUIDs. Veja o hex acima para montar o parser.")
    log(f"Log gravado em {LOG_PATH}")


async def main() -> int:
    parser = argparse.ArgumentParser(description="Debug BLE Omron Complete")
    parser.add_argument("address", nargs="?", default=DEFAULT_MAC)
    parser.add_argument("--scan", type=float, default=25.0, help="Segundos de scan inicial")
    parser.add_argument("--seconds", type=float, default=75.0, help="Segundos ouvindo notify após conectar")
    parser.add_argument("--skip-eeprom", action="store_true")
    args = parser.parse_args()
    mac = args.address.strip().upper().replace("-", ":")

    LOG_PATH.write_text("", encoding="utf-8")
    log(f"Início debug  mac={mac}  python={sys.version.split()[0]}  {sys.platform}")
    log("Feche OMRON connect e a tela /pressao do totem. Eles competem pelo rádio Windows.")

    device = await phase_scan(mac, args.scan)
    client = await phase_connect(mac, device)
    notify_counts: dict[str, int] = {}
    if client is None:
        summarize(device is not None, False, {})
        return 1
    try:
        await phase_gatt(client)
        notify_counts = await phase_listen(client, args.seconds)
        if not args.skip_eeprom:
            await phase_eeprom(client)
    finally:
        try:
            await client.disconnect()
            log("Desconectado.")
        except Exception as exc:
            log(f"disconnect: {exc}")
    summarize(device is not None, True, notify_counts)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
