"""Parse Android btsnoop_hci.log for ICOMON/RelaxFit ATT traffic.

Uso:
  uv run python scripts/parse_btsnoop_icomon.py CAMINHO\\btsnoop_hci.log
"""

from __future__ import annotations

import struct
import sys
from collections import Counter
from pathlib import Path

ATT_WRITE_REQ = 0x12
ATT_WRITE_CMD = 0x52
ATT_HANDLE_NFY = 0x1B
ATT_HANDLE_IND = 0x1D

OP_LABEL = {
    0xA0: "A0",
    0xA1: "A1",
    0xA2: "A2-peso",
    0xA3: "A3",
    0xA7: "A7-bia",
    0xAA: "AA",
    0xBA: "BA-perfil",
    0xBB: "BB-clear",
    0xBD: "BD",
    0xB0: "B0-ack",
    0xC0: "C0-user",
    0xC1: "C1-lista",
}


def load_packets(path: Path) -> tuple[int, list[tuple[int, int, bytes]]]:
    data = path.read_bytes()
    if data[:8] != b"btsnoop\x00":
        raise SystemExit(f"not btsnoop: {data[:8]!r}")
    version, datalink = struct.unpack(">II", data[8:16])
    off = 16
    pkts: list[tuple[int, int, bytes]] = []
    while off + 24 <= len(data):
        orig, incl, flags, drops, ts = struct.unpack(">IIIIq", data[off : off + 24])
        del orig, drops
        off += 24
        pkt = data[off : off + incl]
        off += incl
        pkts.append((ts, flags, pkt))
    return datalink, pkts


def extract_att(pkt: bytes) -> bytes | None:
    """HCI ACL (0x02) → L2CAP CID 4 (ATT)."""
    if not pkt or pkt[0] != 0x02 or len(pkt) < 9:
        return None
    body = pkt[1:]
    length = body[2] | (body[3] << 8)
    l2 = body[4 : 4 + length]
    if len(l2) < 4:
        return None
    cid = l2[2] | (l2[3] << 8)
    if cid != 4:
        return None
    alen = l2[0] | (l2[1] << 8)
    att = l2[4 : 4 + alen]
    return att if att else None


def payload_opcode(value: bytes) -> int | None:
    if len(value) >= 5 and value[4] in OP_LABEL:
        return value[4]
    if value and value[0] in OP_LABEL:
        return value[0]
    return None


def parse_a7_ohms(value: bytes) -> list[float] | None:
    body = value[4:] if len(value) >= 6 and value[4] == 0xA7 else value
    if not body or body[0] != 0xA7 or len(body) < 14:
        return None
    count = int.from_bytes(body[10:12], "little")
    if count <= 0 or count > 16:
        count = 10
    zs: list[float] = []
    for i in range(count):
        offset = 12 + i * 2
        if offset + 2 > len(body):
            break
        raw = int.from_bytes(body[offset : offset + 2], "little")
        zs.append(round(raw / 10.0, 1))
    return zs


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("uso: python parse_btsnoop_icomon.py <btsnoop_hci.log>")
    path = Path(sys.argv[1])
    datalink, pkts = load_packets(path)
    print(f"arquivo={path} datalink={datalink} pacotes={len(pkts)}")

    counts: Counter[str] = Counter()
    for i, (_ts, flags, pkt) in enumerate(pkts):
        att = extract_att(pkt)
        if att is None or len(att) < 3:
            continue
        opcode = att[0]
        handle = int.from_bytes(att[1:3], "little")
        value = att[3:]
        direction = "RX" if opcode in {ATT_HANDLE_NFY, ATT_HANDLE_IND} else "TX"
        if opcode not in {ATT_WRITE_REQ, ATT_WRITE_CMD, ATT_HANDLE_NFY, ATT_HANDLE_IND}:
            continue
        ic_op = payload_opcode(value)
        label = OP_LABEL.get(ic_op, f"0x{ic_op:02x}" if ic_op is not None else "?")
        counts[f"{direction}:{label}"] += 1
        extra = ""
        if ic_op == 0xA7:
            zs = parse_a7_ohms(value)
            extra = f" Z={zs}"
        elif ic_op == 0xA2 and len(value) >= 6:
            extra = f" status=0x{value[5]:02x}"
        print(
            f"{i:6d} {direction:2s} h={handle:04x} {label:10s} hex={value.hex()}{extra}"
        )

    print("--- contagem ---")
    for key, n in counts.most_common():
        print(f"  {key}: {n}")


if __name__ == "__main__":
    main()
