import asyncio
import re

from fastapi import WebSocket

MAC_RE = re.compile(r"^([0-9A-F]{2}:){5}[0-9A-F]{2}$")

# Serializa connect/scan no Windows para evitar WinError por rádio compartilhado.
ble_radio_lock = asyncio.Lock()


def normalize_mac(address: str) -> str:
    mac = address.strip().upper().replace("-", ":")
    if not MAC_RE.match(mac):
        raise ValueError("Informe um endereço MAC no formato AA:BB:CC:DD:EE:FF.")
    return mac


async def watch_websocket_closed(websocket: WebSocket) -> None:
    """Termina quando o frontend fecha o WebSocket (evita travar o reload do uvicorn)."""
    try:
        while True:
            await websocket.receive()
    except Exception:
        return
