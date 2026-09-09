"""Parser ICOMON / Relaxmedic RM-RD2504A (serviço FFB0).

Esta balança NÃO usa frames Fitdays de 20 bytes fragmentados.
Cada notificação é: [seq u16 LE][len u16 LE][payload `len` bytes][checksum 1B]

- FFB2 / A2: peso ao vivo — status 0x01 medindo, 0x03 estável
- FFB3 / A7: resultado BIA — peso + até 10 impedâncias u16 LE (/10 = Ω)
  * Só pés  → Z quase tudo zero (ignorar como completo)
  * Pés+barra → Z preenchidas
"""

from __future__ import annotations

import logging
import os
import time

from app.services.scale.reading import ScaleReading, SegmentImpedance

logger = logging.getLogger(__name__)

FFB1_UUID = "0000ffb1-0000-1000-8000-00805f9b34fb"
FFB2_UUID = "0000ffb2-0000-1000-8000-00805f9b34fb"
FFB3_UUID = "0000ffb3-0000-1000-8000-00805f9b34fb"

NUM_IMPEDANCES = 10
MIN_VALID_Z = 40.0
MAX_VALID_Z = 700.0

SEGMENT_ORDER = (
    # Ordem no fio A7 desta Relaxmedic: 4 membros + líder (tronco) por banda.
    ("Braço direito", "braco_dir", 20),
    ("Braço esquerdo", "braco_esq", 20),
    ("Perna direita", "perna_dir", 20),
    ("Perna esquerda", "perna_esq", 20),
    ("Tronco", "tronco", 20),
    ("Braço direito", "braco_dir", 100),
    ("Braço esquerdo", "braco_esq", 100),
    ("Perna direita", "perna_dir", 100),
    ("Perna esquerda", "perna_esq", 100),
    ("Tronco", "tronco", 100),
)


class IcomonAssembler:
    """Compat no-op: esta balança já entrega a mensagem inteira por notificação."""

    def reset(self) -> None:
        return None

    def add(self, data: bytes) -> bytes | None:
        return bytes(data)


def _u24_be(data: bytes, start: int) -> float | None:
    if len(data) < start + 3:
        return None
    raw = int.from_bytes(data[start : start + 3], "big") & 0x3FFFF
    if raw <= 0:
        return None
    return round(raw / 1000.0, 3)


def _split_frame(buf: bytes) -> bytes | None:
    """Extrai o payload após [seq:2][len:2]. Aceita também payload cru."""
    if not buf:
        return None
    if len(buf) >= 6 and buf[4] in {0xA0, 0xA1, 0xA2, 0xA3, 0xA7, 0xAA}:
        plen = int.from_bytes(buf[2:4], "little")
        body = buf[4 : 4 + plen]
        if len(body) >= 1:
            return body
    if buf[0] in {0xA2, 0xA3, 0xA7, 0xAA}:
        return buf
    return None


def label_segments(impedancias: list[float]) -> list[SegmentImpedance]:
    labeled: list[SegmentImpedance] = []
    for i, ohm in enumerate(impedancias[: len(SEGMENT_ORDER)]):
        nome, lado, freq = SEGMENT_ORDER[i]
        labeled.append(SegmentImpedance(nome=nome, lado=lado, freq_khz=freq, ohm=ohm))
    return labeled


def _z_quality(values: list[float]) -> tuple[bool, str]:
    from app.services.scale.wla25 import impedances_valid, to_wla25_order

    if len(values) < 8:
        return False, f"só {len(values)} valores"
    zeros = sum(1 for z in values if z < 5.0)
    if zeros >= 6:
        return False, f"quase zerado (só pés?): zeros={zeros} values={values}"

    ordered = to_wla25_order(values)
    if not impedances_valid(ordered):
        if ordered[0] < 1.0 or ordered[5] < 1.0:
            return False, f"canal do líder zerado (Z={ordered[0]}/{ordered[5]})"
        bad = [f"z{i}={ordered[i]}" for i in (1, 2, 3, 4, 6, 7, 8, 9) if ordered[i] < 100]
        return False, "eletrodo sem contato: " + (", ".join(bad) if bad else str(ordered))

    # Os dois valores "líder" (índices 0 e 5) não são ohms de tronco na escala
    # dos membros — capturas reais trazem 2,9 e 75,0 numa medição que a própria
    # balança aceitou e exibiu. Só exigimos que não estejam zerados; quem manda
    # na qualidade são os 8 membros, validados acima.
    return True, f"ok wla25={ordered}"


def quality_hint(values: list[float]) -> str:
    ok, reason = _z_quality(values)
    if ok:
        return "Sensores OK."
    if "tronco" in reason or "barra" in reason or "líder" in reason:
        return (
            "Canal do tronco fraco — segure a barra com as duas mãos (polegares nos eletrodos), "
            "braços ~40°, sem encostar a barra no corpo, e aguarde."
        )
    if "só pés" in reason or "zerado" in reason:
        return "Ainda só li os pés. Pegue a barra com as duas mãos e estique ~40°."
    return f"Impedâncias incompletas ({reason}). Mantenha pés e mãos nos eletrodos."


def _parse_a2(body: bytes) -> ScaleReading | None:
    # A2 status marker weight[3] ...
    if len(body) < 6:
        return None
    status = body[1]
    peso = _u24_be(body, 3)
    if peso is None:
        peso = _u24_be(body, 2)
    if peso is None:
        return None
    return ScaleReading(
        peso_kg=peso,
        estavel=status in {0x00, 0x02, 0x03} and peso >= 10,
        completo=False,
        fonte="ffb2",
        etapa="wait_stable" if status == 0x01 else "hold_bar",
    )


def _parse_a7(body: bytes) -> ScaleReading | None:
    """A7: [type][5B meta][weight u24 BE][0x00][count u16 LE][count * u16 LE Z]..."""
    if len(body) < 14:
        return None
    peso = _u24_be(body, 6)
    if peso is None:
        return None

    count = int.from_bytes(body[10:12], "little")
    if count <= 0 or count > 16:
        count = NUM_IMPEDANCES

    zs: list[float] = []
    for i in range(count):
        offset = 12 + i * 2
        if offset + 2 > len(body):
            break
        raw = int.from_bytes(body[offset : offset + 2], "little")
        zs.append(round(raw / 10.0, 1))

    ok, reason = _z_quality(zs)
    logger.info("icomon A7 peso=%s Z=%s quality=%s (%s)", peso, zs, ok, reason)

    if not ok:
        return ScaleReading(
            peso_kg=peso,
            estavel=True,
            completo=False,
            impedancias_ohm=zs,
            segmentos=label_segments(zs),
            fonte="ffb3",
            etapa="measuring",
        )

    return ScaleReading(
        peso_kg=peso,
        estavel=True,
        completo=True,
        impedancias_ohm=zs[:NUM_IMPEDANCES],
        segmentos=label_segments(zs[:NUM_IMPEDANCES]),
        fonte="ffb3",
        etapa="done",
    )


def decode_payload(payload: bytes) -> ScaleReading | None:
    if not payload:
        return None
    mtype = payload[0]
    logger.info("icomon decode type=0x%02x len=%s hex=%s", mtype, len(payload), payload.hex())

    if mtype == 0xA2:
        return _parse_a2(payload)
    if mtype == 0xA7:
        return _parse_a7(payload)
    if mtype in {0xA3}:
        # Variante Fitdays antiga — tenta o mesmo layout A7 se couber.
        if len(payload) >= 32:
            return _parse_a7(payload)
    if mtype in {0xAA, 0xA0, 0xA1}:
        logger.info("icomon ignorando tipo 0x%02x", mtype)
        return None
    return None


def ingest_frame(assembler: IcomonAssembler, data: bytearray | bytes) -> ScaleReading | None:
    buf = bytes(data)
    body = _split_frame(buf)
    if body is None:
        # fallback: assembler no-op
        body = assembler.add(buf)
    if body is None:
        return None
    return decode_payload(body)


def parse_icomon_ffb2(data: bytearray | bytes) -> ScaleReading | None:
    reading = ingest_frame(IcomonAssembler(), data)
    if reading is None or reading.fonte != "ffb2":
        return None
    return reading


def parse_icomon_ffb3(data: bytearray | bytes) -> ScaleReading | None:
    reading = ingest_frame(IcomonAssembler(), data)
    if reading is None or reading.fonte != "ffb3":
        return None
    return reading


def parser_icomon_ffb2(data: bytearray) -> float | None:
    reading = parse_icomon_ffb2(data)
    return None if reading is None else reading.peso_kg


def _frame_checksum_5bit(frame20: bytes) -> int:
    return sum(frame20[3:19]) & 0x1F


# Qual envelope usar nas escritas FFB1. O formato correto para esta firmware
# ainda não foi confirmado com captura do app; `scripts/icomon_profile_probe.py`
# testa um de cada vez. Trocar via CABINE_ICOMON_FRAME=native|fitdays|openscale|all
FRAME_MODE = os.getenv("CABINE_ICOMON_FRAME", "native").strip().lower()


def build_frames(sequence: int, payload: bytes) -> list[bytes]:
    """Envelope nativo desta RM-RD2504A (igual às notificações capturadas).

    [seq u16 LE][len u16 LE][payload][checksum = sum(payload) & 0x1F]

    O formato Fitdays de 20 bytes (openScale) é outra família; aqui os RX
    reais usam seq/len de 16 bits, e o checksum fecha sobre o payload.
    """
    plen = len(payload)
    chk = sum(payload) & 0x1F
    return [
        (sequence & 0xFFFF).to_bytes(2, "little")
        + plen.to_bytes(2, "little")
        + payload
        + bytes([chk])
    ]


def build_frames_fitdays(sequence: int, payload: bytes) -> list[bytes]:
    """Fitdays/openScale: frame fixo 20B [seq][len][frag][16B][chk].

    `len` = tamanho total do payload (sacoma). O trailing além de 16 bytes
    é truncado, como no RelaxmedicHandler.
    """
    frame = bytearray(20)
    frame[0] = sequence & 0xFF
    frame[1] = len(payload) & 0xFF
    frame[2] = 0x00
    carried = min(len(payload), 16)
    frame[3 : 3 + carried] = payload[:carried]
    frame[19] = _frame_checksum_5bit(frame)
    return [bytes(frame)]


def build_frames_fitdays_openscale(sequence: int, payload: bytes) -> list[bytes]:
    """Variante openScale: `len` = len(payload) - 1."""
    frame = bytearray(20)
    frame[0] = sequence & 0xFF
    frame[1] = (max(len(payload) - 1, 0)) & 0xFF
    frame[2] = 0x00
    carried = min(len(payload), 16)
    frame[3 : 3 + carried] = payload[:carried]
    frame[19] = _frame_checksum_5bit(frame)
    return [bytes(frame)]


def _people_flags(people_type: str | None) -> int:
    """0x0F = atleta (Fitdays sportman); 0x2F = normal."""
    if people_type and people_type.lower() in {"athlete", "sportman", "atleta", "fit"}:
        return 0x0F
    return 0x2F


def _ba_payload_sacoma(
    *,
    height_cm: float,
    age: int,
    sex: str,
    weight_kg: float,
    stabilized: bool,
    user_id: int = 0,
    people_type: str = "normal",
) -> bytes:
    unix_time = int(time.time())
    weight_raw = int(round(max(weight_kg, 1.0) * 100.0)) & 0x7FFF
    if stabilized and weight_raw:
        weight_raw |= 0x8000
    age_sex = (int(age) & 0x7F) | (0x80 if sex == "male" else 0x00)
    payload = bytearray()
    payload.append(0xBA)
    payload.extend(unix_time.to_bytes(4, "big"))
    payload.extend((0x0078).to_bytes(2, "big"))
    payload.extend((user_id & 0xFFFFFFFF).to_bytes(4, "big"))
    payload.append(int(height_cm) & 0xFF)
    payload.extend(weight_raw.to_bytes(2, "big"))
    payload.append(age_sex)
    payload.append(_people_flags(people_type))
    return bytes(payload)


def _ba_payload_openscale(
    *,
    height_cm: float,
    age: int,
    sex: str,
    weight_kg: float,
    user_id: int = 0,
    people_type: str = "normal",
) -> bytes:
    from datetime import datetime, timezone

    unix_time = int(time.time())
    offset_min = int(datetime.now(timezone.utc).astimezone().utcoffset().total_seconds() // 60)
    encoded_offset = abs(offset_min) & 0x7FFF
    if offset_min < 0:
        encoded_offset |= 0x8000
    weight_raw = int(round(max(weight_kg, 1.0) * 100.0)) & 0xFFFF
    age_sex = (int(age) & 0x7F) | (0x80 if sex == "male" else 0x00)
    payload = bytearray(17)
    payload[0] = 0xBA
    payload[1:5] = unix_time.to_bytes(4, "big")
    payload[5:7] = encoded_offset.to_bytes(2, "big")
    payload[7:11] = (user_id & 0xFFFFFFFF).to_bytes(4, "big")
    payload[11] = int(height_cm) & 0xFF
    payload[12:14] = weight_raw.to_bytes(2, "big")
    payload[14] = age_sex
    payload[15] = _people_flags(people_type)
    payload[16] = 0x0F
    return bytes(payload)


GUEST_USER_ID = 0  # P-0 / convidado — o BA de sessão; a RM-RD2504A ignora para casar usuário
SLOT_USER_ID = 1  # P-1 — slot persistente que a firmware usa no reconhecimento ±2 kg
# ID interno do RelaxFit nas capturas C0/C1 (0x1388). Não é o índice P-n.
FITDAYS_APP_USER_ID = 5000
DEFAULT_USER_COLOR = bytes([0x41, 0x5A, 0xC3])  # RGB visto no C0 da Karla


def _age_sex_byte(age: int, sex: str) -> int:
    return (int(age) & 0x7F) | (0x80 if sex == "male" else 0x00)


def _weight_hundredths(weight_kg: float) -> int:
    return int(round(max(weight_kg, 1.0) * 100.0)) & 0x7FFF


def _tz_offset_encoded() -> int:
    from datetime import datetime, timezone

    offset_min = int(datetime.now(timezone.utc).astimezone().utcoffset().total_seconds() // 60)
    encoded = abs(offset_min) & 0x7FFF
    if offset_min < 0:
        encoded |= 0x8000
    return encoded


def _display_name_bytes(name: str | None) -> bytes:
    raw = (name or "User").strip() or "User"
    encoded = raw.encode("utf-8")[:20]
    return encoded if encoded else b"User"


def encode_c0_profile(
    sequence: int,
    *,
    height_cm: float,
    age: int,
    sex: str,
    weight_kg: float,
    display_name: str | None = None,
    people_type: str = "normal",
    app_user_id: int = FITDAYS_APP_USER_ID,
    color_rgb: bytes = DEFAULT_USER_COLOR,
) -> list[bytes]:
    """0xC0 — perfil ativo do RelaxFit (captura Karla). Inclui nome.

    Layout: c0 | time4 | tz2 | 0x00 | height | weight2 | agesex | app_uid4 |
            people_flags | 0x02 | rgb3 | 0x01 | 0x00 | namelen | name
    """
    name = _display_name_bytes(display_name)
    payload = bytearray()
    payload.append(0xC0)
    payload.extend(int(time.time()).to_bytes(4, "big"))
    payload.extend(_tz_offset_encoded().to_bytes(2, "big"))
    payload.append(0x00)
    payload.append(int(height_cm) & 0xFF)
    payload.extend(_weight_hundredths(weight_kg).to_bytes(2, "big"))
    payload.append(_age_sex_byte(age, sex))
    payload.extend((app_user_id & 0xFFFFFFFF).to_bytes(4, "big"))
    payload.append(_people_flags(people_type))
    payload.append(0x02)
    rgb = color_rgb[:3] if len(color_rgb) >= 3 else DEFAULT_USER_COLOR
    payload.extend(rgb)
    payload.append(0x01)
    payload.append(0x00)
    payload.append(len(name) & 0xFF)
    payload.extend(name)
    return build_frames(sequence, bytes(payload))


def encode_c1_users(
    sequence: int,
    users: list[dict],
    *,
    app_user_id: int = FITDAYS_APP_USER_ID,
) -> list[bytes]:
    """0xC1 — lista de usuários do RelaxFit (P1…Pn com nome).

    Cada entrada: index | height | weight2 | agesex | app_uid4 | flags |
                  0x02 | rgb3 | 0x01 | role | namelen | name
    """
    payload = bytearray()
    payload.append(0xC1)
    payload.append(len(users) & 0xFF)
    for idx, user in enumerate(users, start=1):
        name = _display_name_bytes(user.get("display_name") or user.get("name"))
        payload.append(idx & 0xFF)
        payload.append(int(user["height_cm"]) & 0xFF)
        payload.extend(_weight_hundredths(float(user["weight_kg"])).to_bytes(2, "big"))
        payload.append(_age_sex_byte(int(user["age"]), str(user["sex"])))
        payload.extend((app_user_id & 0xFFFFFFFF).to_bytes(4, "big"))
        payload.append(_people_flags(str(user.get("people_type") or "normal")))
        payload.append(0x02)
        rgb = user.get("color_rgb") or DEFAULT_USER_COLOR
        payload.extend(bytes(rgb)[:3])
        payload.append(0x01)
        # 0x01 = slot especial tipo "P-1"; 0x00 = usuário nomeado normal
        payload.append(0x01 if idx == 1 and name in {b"P-1", b"P1"} else 0x00)
        payload.append(len(name) & 0xFF)
        payload.extend(name)
    return build_frames(sequence, bytes(payload))


def _bb_payload(
    *,
    height_cm: float,
    age: int,
    sex: str,
    weight_kg: float,
    user_id: int = GUEST_USER_ID,
) -> bytes:
    """user_id=0 = convidado (sem memória); 1+ grava slot persistente P-n."""
    weight_raw = int(round(max(weight_kg, 1.0) * 100.0)) & 0x7FFF
    weight_raw |= 0x8000
    age_sex = (int(age) & 0x7F) | (0x80 if sex == "male" else 0x00)
    payload = bytearray()
    payload.append(0xBB)
    payload.append(0x01)
    payload.extend((user_id & 0xFFFFFFFF).to_bytes(4, "big"))
    payload.append(int(height_cm) & 0xFF)
    payload.extend(weight_raw.to_bytes(2, "big"))
    payload.append(age_sex)
    return bytes(payload)


def _wrap(sequence: int, payload: bytes) -> list[bytes]:
    """Empacota conforme FRAME_MODE.

    Enviar os três formatos de uma vez ("all") polui o canal: a balança recebe
    dois frames inválidos para cada válido. Só use para diagnóstico.
    """
    if FRAME_MODE == "fitdays":
        return build_frames_fitdays(sequence, payload)
    if FRAME_MODE == "openscale":
        return build_frames_fitdays_openscale(sequence, payload)
    if FRAME_MODE == "all":
        return (
            build_frames(sequence, payload)
            + build_frames_fitdays(sequence, payload)
            + build_frames_fitdays_openscale(sequence, payload)
        )
    return build_frames(sequence, payload)


def encode_reply(sequence: int, ack_seq: int = 0) -> list[bytes]:
    return _wrap(sequence, bytes([0xB0, ack_seq & 0xFF, 0x00]))


def encode_other(sequence: int, sub_cmd: int = 0x09) -> list[bytes]:
    return _wrap(sequence, bytes([0xBD, sub_cmd & 0xFF]))


def _wrap_profile(sequence: int, payload: bytes) -> list[bytes]:
    """BA/BB: nativo (o que esta RM-RD2504A emite) + envelope openScale (o que o RelaxFit escreve)."""
    if FRAME_MODE in {"fitdays", "openscale", "all"}:
        return _wrap(sequence, payload)
    return build_frames(sequence, payload) + build_frames_fitdays_openscale(sequence, payload)


def encode_user_list(
    sequence: int,
    *,
    height_cm: float,
    age: int,
    sex: str,
    weight_kg: float,
    user_id: int = GUEST_USER_ID,
    people_type: str = "normal",
) -> list[bytes]:
    """0xBB — lista de usuários. Preferir encode_clear_users + BA convidado."""
    del people_type
    payload = _bb_payload(
        height_cm=height_cm,
        age=age,
        sex=sex,
        weight_kg=weight_kg,
        user_id=user_id,
    )
    return _wrap_profile(sequence, payload)


def encode_clear_users(sequence: int) -> list[bytes]:
    """0xBB count=0 — apaga slots offline (P-1…) para a sessão não ficar no último peso."""
    return _wrap_profile(sequence, bytes([0xBB, 0x00]))


def encode_profile_sync(
    sequence: int,
    *,
    height_cm: float,
    age: int,
    sex: str,
    weight_kg: float,
    stabilized: bool = True,
    user_id: int = GUEST_USER_ID,
    people_type: str = "normal",
    native_only: bool = False,
    openscale_only: bool = False,
) -> list[bytes]:
    """0xBA — sessão atual. user_id=0 = convidado (BIA para quem estiver na plataforma)."""
    if openscale_only:
        return build_frames_fitdays_openscale(
            sequence,
            _ba_payload_openscale(
                height_cm=height_cm,
                age=age,
                sex=sex,
                weight_kg=weight_kg,
                user_id=user_id,
                people_type=people_type,
            ),
        )
    if FRAME_MODE in {"fitdays", "openscale"}:
        payload = _ba_payload_openscale(
            height_cm=height_cm,
            age=age,
            sex=sex,
            weight_kg=weight_kg,
            user_id=user_id,
            people_type=people_type,
        )
        return _wrap(sequence, payload)
    sacoma = _ba_payload_sacoma(
        height_cm=height_cm,
        age=age,
        sex=sex,
        weight_kg=weight_kg,
        stabilized=stabilized,
        user_id=user_id,
        people_type=people_type,
    )
    if native_only:
        return build_frames(sequence, sacoma)
    openscale = _ba_payload_openscale(
        height_cm=height_cm,
        age=age,
        sex=sex,
        weight_kg=weight_kg,
        user_id=user_id,
        people_type=people_type,
    )
    if FRAME_MODE == "all":
        return _wrap(sequence, sacoma)
    return build_frames(sequence, sacoma) + build_frames_fitdays_openscale(sequence, openscale)


def frame_seq(raw: bytes) -> int:
    """Extrai o sequence number de um frame nativo RX."""
    if len(raw) >= 2:
        return int.from_bytes(raw[0:2], "little") & 0xFFFF
    return 0
