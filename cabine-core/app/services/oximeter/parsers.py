from __future__ import annotations

from dataclasses import dataclass


def crc8_maxim(data: bytes) -> int:
    crc = 0
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0x8C
            else:
                crc >>= 1
    return crc & 0xFF


def make_creative_frame(token: int, payload: bytes) -> bytes:
    """Quadro AA 55; length = payload + CRC8/MAXIM (mesmo envelope da linha PC-60)."""
    length = len(payload) + 1
    body = bytes([0xAA, 0x55, token & 0xFF, length & 0xFF]) + payload
    return body + bytes([crc8_maxim(body)])


def make_xor_frame(token: int, payload: bytes) -> bytes:
    length = len(payload) + 1
    body = bytes([0xAA, 0x55, token & 0xFF, length & 0xFF]) + payload
    xor = 0
    for byte in body:
        xor ^= byte
    return body + bytes([xor & 0xFF])


@dataclass(frozen=True, slots=True)
class OximeterSample:
    spo2_pct: int | None
    pulse_bpm: int | None
    pi_pct: float | None = None
    finger_on: bool = False
    kind: str = "values"
    waveform: tuple[int, ...] = ()


def _valid_spo2(value: int) -> bool:
    return 35 <= value <= 100


def _valid_pulse(value: int) -> bool:
    return 30 <= value <= 240


def _decode_wave_byte(byte: int) -> int:
    """PC-60: amostra 0–127; bit 7 marca spike (subtrai 0x80)."""
    return byte - 0x80 if byte >= 0x80 else byte


def parse_creative_frame(frame: bytes) -> OximeterSample | None:
    """Quadro da linha Creative/Lepu/Viatom PC-60 (AA 55 ... CRC8/MAXIM)."""
    if len(frame) < 5 or frame[0] != 0xAA or frame[1] != 0x55:
        return None
    length = frame[3]
    expected = 4 + length
    if expected < 5 or len(frame) < expected:
        return None
    body = frame[:expected]
    if crc8_maxim(body) != 0 and frame[2] not in {0x0F, 0xF0}:
        return None
    token = frame[2]
    if length < 1:
        return None
    func = frame[4]

    # SpO2 / PR / PI (display)
    if token == 0x0F and func == 0x01 and length >= 5:
        spo2 = frame[5]
        pulse = frame[6]
        pi_raw = frame[8] if expected > 8 else 0
        if spo2 in {0, 0x7F, 0xFF} or pulse in {0, 0xFF}:
            return OximeterSample(spo2_pct=None, pulse_bpm=None, finger_on=False, kind="values")
        spo2_ok = spo2 if _valid_spo2(spo2) else None
        pulse_ok = pulse if _valid_pulse(pulse) else None
        pi = round(pi_raw / 10.0, 1) if pi_raw else None
        return OximeterSample(
            spo2_pct=spo2_ok,
            pulse_bpm=pulse_ok,
            pi_pct=pi,
            finger_on=spo2_ok is not None and pulse_ok is not None,
            kind="values",
        )

    # Pleth real (func 0x02) — vários pontos por quadro, ~25 Hz no conjunto
    if token == 0x0F and func == 0x02 and length >= 2:
        points = tuple(_decode_wave_byte(byte) for byte in frame[5 : expected - 1])
        if points:
            return OximeterSample(
                spo2_pct=None,
                pulse_bpm=None,
                finger_on=True,
                kind="wave",
                waveform=points,
            )

    # Alguns firmwares mandam onda em 0xF0 (exceto bateria 0x03)
    if token == 0xF0 and func != 0x03 and length >= 3:
        points = tuple(_decode_wave_byte(byte) for byte in frame[5 : expected - 1])
        if len(points) >= 2:
            return OximeterSample(
                spo2_pct=None,
                pulse_bpm=None,
                finger_on=True,
                kind="wave",
                waveform=points,
            )

    # ACK / status (ex.: aa 55 0f 03 04 01 …) — não é onda
    return None


def parse_berrymed_packet(packet: bytes) -> OximeterSample | None:
    """Pacote de 5 bytes usado por alguns oxímetros BLE (BerryMed / iChoice)."""
    if len(packet) < 5:
        return None
    if packet[0] & 0x80 == 0:
        return None
    if packet[1] & 0x80 or packet[2] & 0x80 or packet[3] & 0x80:
        return None
    pulse = ((packet[2] & 0x40) << 1) | (packet[3] & 0x7F)
    spo2 = packet[4] & 0x7F
    if spo2 in {0, 0x7F} or pulse == 0:
        return OximeterSample(spo2_pct=None, pulse_bpm=None, finger_on=False)
    if not _valid_spo2(spo2) or not _valid_pulse(pulse):
        return None
    return OximeterSample(
        spo2_pct=spo2,
        pulse_bpm=pulse,
        finger_on=True,
        waveform=(packet[0] & 0x7F,),
        kind="wave",
    )


class CreativeFrameBuffer:
    def __init__(self) -> None:
        self._buf = bytearray()

    def feed(self, chunk: bytes) -> list[OximeterSample]:
        samples: list[OximeterSample] = []
        if not chunk:
            return samples
        self._buf.extend(chunk)

        if self._buf[:1] == b"\xaa":
            pass
        elif self._buf and self._buf[0] & 0x80:
            while len(self._buf) >= 5 and self._buf[0] != 0xAA:
                packet = bytes(self._buf[:5])
                parsed = parse_berrymed_packet(packet)
                del self._buf[:5]
                if parsed is not None:
                    samples.append(parsed)
            return samples

        while True:
            idx = self._buf.find(b"\xaa\x55")
            if idx < 0:
                if len(self._buf) > 64:
                    del self._buf[:-1]
                break
            if idx > 0:
                del self._buf[:idx]
            if len(self._buf) < 4:
                break
            length = self._buf[3]
            total = 4 + length
            if total > 64 or total < 5:
                del self._buf[:2]
                continue
            if len(self._buf) < total:
                break
            frame = bytes(self._buf[:total])
            del self._buf[:total]
            parsed = parse_creative_frame(frame)
            if parsed is not None:
                samples.append(parsed)
        return samples
