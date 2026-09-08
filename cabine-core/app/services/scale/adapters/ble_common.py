import re

MAC_RE = re.compile(r"^([0-9A-F]{2}:){5}[0-9A-F]{2}$")


def normalize_mac(address: str) -> str:
    mac = address.strip().upper().replace("-", ":")
    if not MAC_RE.match(mac):
        raise ValueError("Informe um endereço MAC no formato AA:BB:CC:DD:EE:FF.")
    return mac
