import asyncio
import logging
import os
import time

from bleak import BleakClient, BleakError, BleakScanner
from fastapi import WebSocket

from app.services.scale.adapters.base import DispatchFn, ScaleAdapter, StatusFn
from app.services.scale.adapters.ble_common import normalize_mac
from app.services.scale.icomon import (
    FFB1_UUID,
    FFB2_UUID,
    FFB3_UUID,
    GUEST_USER_ID,
    IcomonAssembler,
    encode_c0_profile,
    encode_c1_users,
    encode_clear_users,
    encode_other,
    encode_profile_sync,
    encode_reply,
    frame_seq,
    ingest_frame,
    quality_hint,
)
from app.services.scale.metrics import PersonProfile
from app.services.scale.parsers import ParserFn
from app.services.scale.reading import ScaleReading
from app.services.scale.spec import ScaleSpec

logger = logging.getLogger(__name__)

STEP_ORDER = (
    "step_on",
    "wait_stable",
    "hold_bar",
    "extend_bar",
    "measuring",
    "done",
)

# Heartbeat só com plataforma vazia. Escrever BA no meio da pesagem aborta a BIA.
BA_HEARTBEAT_S = 2.0

# "minimal" = handshake do RelaxFit capturado (C0 perfil + C1 lista + C0).
# A composição (WLA25) continua na Cabine. "aggressive" = BB-clear/BA-live.
SESSION_MODE = os.getenv("CABINE_ICOMON_SESSION", "minimal").strip().lower()
MINIMAL_SESSION = SESSION_MODE != "aggressive"

# Curto de propósito: a janela entre a pessoa pisar e a balança decidir se faz
# bioimpedância é de poucos segundos. Se o link não estiver de pé nessa hora,
# ela mede offline e ignora o perfil que enviamos.
RECONNECT_DELAY_S = 0.2
CONNECT_TIMEOUT_S = 8.0
SCAN_SLICE_S = 1.5


async def wait_for_advertising(
    address: str,
    consumer: asyncio.Task,
    send_status: StatusFn,
    send_debug,
) -> object | None:
    """Espera o advertising. No Windows, conectar pelo MAC sem scan quase sempre falha.

    A RM-RD2504A só anuncia com a plataforma acordada (~15 s). Tentar GATT
    enquanto ela dorme trava 10–25 s e perde o instante em que a pessoa sobe.
    """
    target = address.strip().upper()
    await send_status("Aguardando a balança. Pise nela agora para acordar.")
    round_n = 0
    while not consumer.done():
        round_n += 1
        try:
            device = await BleakScanner.find_device_by_address(target, timeout=SCAN_SLICE_S)
        except Exception as exc:
            logger.warning("scan BLE falhou: %s", exc)
            await send_debug(f"Scan falhou: {exc}")
            await asyncio.sleep(0.4)
            continue
        if device is not None:
            await send_debug(
                f"Advertising {device.address} name={getattr(device, 'name', None)!r}"
            )
            await send_status("Balança encontrada. Conectando...")
            return device
        if round_n == 8:
            await send_status(
                "Ainda sem sinal. Pise nela (ou toque com o pé) e feche o RelaxFit no celular."
            )
        elif round_n % 12 == 0:
            await send_status("Aguardando a balança. Pise nela agora para acordar.")
    return None


class BleIcomonGattAdapter(ScaleAdapter):
    key = "ble_icomon"
    label = "BLE GATT ICOMON / RelaxFit (FFB0)"
    address_kind = "mac"
    address_label = "Endereço MAC"
    parsers = ("icomon_ffb2",)
    supports_bia = True

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
        profile: PersonProfile | None = None,
        profile_box: list | None = None,
        profile_sync_box: list | None = None,
    ) -> None:
        last: ScaleReading | None = None
        current_step = "step_on"
        stable_since: float | None = None
        hold_bar_since: float | None = None
        weight_profile_sent = False
        saw_nonzero_z = False
        saw_a7 = False
        saw_lock = False
        bia_stalled_warned = False
        done_weight: float | None = None
        seq = 0
        reply_idx = 0
        last_ba_at = 0.0
        last_ba_weight: float | None = None
        memory_cleared_at: float | None = None
        ffb2_asm = IcomonAssembler()
        ffb3_asm = IcomonAssembler()
        write_lock = asyncio.Lock()
        client_holder: dict = {"client": None}
        pending_writes: asyncio.Queue = asyncio.Queue()
        box: list = profile_box if profile_box is not None else [profile]
        sync_token_box: list = profile_sync_box if profile_sync_box is not None else [0]
        last_sync_token = -1

        def active_profile() -> PersonProfile | None:
            return box[0] if box else None

        def profile_weight(prof: PersonProfile, live: float | None = None) -> float:
            """Peso da sessão (convidado). O ao vivo sempre ganha — senão a memória
            do último usuário (±2 kg) impede a BIA de outra pessoa.
            """
            if live is not None and live >= 10:
                return float(live)
            expected = prof.expected_weight_kg
            if expected is not None and expected >= 10:
                return float(expected)
            return None

        async def push_profile_to_scale(
            label: str,
            *,
            live_kg: float | None = None,
            stabilized: bool = False,
            reset_memory: bool = False,
        ) -> None:
            nonlocal last_ba_at, last_ba_weight, memory_cleared_at
            prof = active_profile()
            if prof is None:
                return
            weight = profile_weight(prof, live_kg)
            on_platform = last is not None and last.peso_kg >= 10
            if on_platform:
                await send_status(
                    "Há alguém no prato — não reenvio o perfil agora. "
                    "Desçam, selecionem a pessoa e subam de novo."
                )
                return

            if MINIMAL_SESSION:
                # Captura RelaxFit (Karla): B0 + C0(nome) + C1(lista) + C0.
                # BA/BB do openScale NÃO liberam BIA nesta firmware — só C0/C1.
                ba_weight = weight if weight is not None else 60.0
                display_name = prof.display_name or "User"
                c0 = encode_c0_profile(
                    next_seq(),
                    height_cm=prof.height_cm,
                    age=prof.age,
                    sex=prof.sex,
                    weight_kg=ba_weight,
                    display_name=display_name,
                    people_type=prof.people_type,
                )
                c1 = encode_c1_users(
                    next_seq(),
                    [
                        {
                            "height_cm": prof.height_cm,
                            "age": prof.age,
                            "sex": prof.sex,
                            "weight_kg": ba_weight,
                            "people_type": prof.people_type,
                            "display_name": display_name,
                        }
                    ],
                )
                await send_debug(
                    f"MEMÓRIA: RelaxFit C0/C1 para {display_name!r} ({ba_weight:.1f} kg)",
                    topic="memory",
                    phase="c0_c1",
                    label=label,
                    hexes=[frame.hex() for frame in c0 + c1],
                    weight_kg=ba_weight,
                    display_name=display_name,
                )
                await write_frames(c0, f"C0-{label}")
                await write_frames(c1, f"C1-{label}")
                await write_frames(
                    encode_c0_profile(
                        next_seq(),
                        height_cm=prof.height_cm,
                        age=prof.age,
                        sex=prof.sex,
                        weight_kg=ba_weight,
                        display_name=display_name,
                        people_type=prof.people_type,
                    ),
                    f"C0b-{label}",
                )
                last_ba_at = time.monotonic()
                last_ba_weight = ba_weight
                queue.put_nowait(
                    {
                        "type": "DEBUG",
                        "msg": f"Perfil aplicado label={label} peso={ba_weight:.1f}",
                        "topic": "memory",
                        "phase": "profile",
                        "session_mode": "minimal",
                        "height_cm": prof.height_cm,
                        "age": prof.age,
                        "sex": prof.sex,
                        "weight_kg": ba_weight,
                        "expected_weight_kg": prof.expected_weight_kg,
                        "display_name": display_name,
                        "guest": False,
                        "reset_memory": False,
                        "protocol": "c0_c1",
                    }
                )
                await send_status(
                    f"Perfil RelaxFit C0/C1: {display_name} · {ba_weight:.1f} kg · "
                    f"{prof.height_cm:.0f} cm · {prof.age} anos. Pegue a barra e suba."
                )
                return

            await write_frames(encode_other(next_seq()), f"BD-{label}")
            await write_frames(encode_reply(next_seq(), 0), f"B0-{label}")
            if reset_memory:
                clear_frames = encode_clear_users(next_seq())
                await send_debug(
                    "MEMÓRIA: pedindo limpeza dos slots offline (BB count=0)",
                    topic="memory",
                    phase="start",
                    label=label,
                    frames=len(clear_frames),
                    hexes=[frame.hex() for frame in clear_frames],
                    envelopes=["openscale-20B" if len(frame) == 20 else f"nativo-{len(frame)}B" for frame in clear_frames],
                    payload="bb00",
                    guest_user_id=GUEST_USER_ID,
                )
                results = await write_frames(clear_frames, f"BB-clear-{label}")
                ok_count = sum(1 for item in results if item.get("ok"))
                memory_cleared_at = time.monotonic() if ok_count else None
                await send_debug(
                    (
                        f"MEMÓRIA: BLE aceitou {ok_count}/{len(clear_frames) or 1} escritas BB-clear"
                        if ok_count
                        else "MEMÓRIA: FALHOU — FFB1 recusou BB-clear (lista offline NÃO foi apagada neste link)"
                    ),
                    topic="memory",
                    phase="write_result",
                    label=label,
                    ok=ok_count > 0,
                    writes=results,
                    note=(
                        "ACK do Bluetooth ≠ EEPROM limpa. Confirmação real: outra pessoa "
                        "(Δ>2 kg do seu peso) subir com a barra e chegar A7."
                    ),
                )
            if weight is None:
                await send_status(
                    "Lista offline limpa. Sem peso na sessão ainda — suba com a barra; "
                    "vou alinhar o BA no quilo ao vivo (±2 kg)."
                )
                last_ba_at = time.monotonic()
                return
            await write_frames(
                encode_profile_sync(
                    next_seq(),
                    height_cm=prof.height_cm,
                    age=prof.age,
                    sex=prof.sex,
                    weight_kg=weight,
                    stabilized=stabilized,
                    user_id=GUEST_USER_ID,
                    people_type=prof.people_type,
                ),
                f"BA-{label}",
            )
            last_ba_at = time.monotonic()
            last_ba_weight = weight
            queue.put_nowait(
                {
                    "type": "DEBUG",
                    "msg": f"Perfil aplicado label={label} peso={weight:.1f}",
                    "height_cm": prof.height_cm,
                    "age": prof.age,
                    "sex": prof.sex,
                    "people_type": prof.people_type,
                    "weight_kg": weight,
                    "expected_weight_kg": prof.expected_weight_kg,
                    "live_kg": live_kg,
                    "guest": True,
                    "reset_memory": reset_memory,
                }
            )
            await send_status(
                f"Sessão convidado: {weight:.1f} kg · {prof.height_cm:.0f} cm · "
                f"{prof.age} anos. Pegue a barra e suba (peso ao vivo precisa ficar a ±2 kg disso)."
            )

        def reset_session(reason: str) -> None:
            nonlocal current_step, last, stable_since, hold_bar_since
            nonlocal weight_profile_sent, saw_nonzero_z, saw_a7, saw_lock, bia_stalled_warned, done_weight
            nonlocal last_ba_weight
            logger.info("icomon reset sessão: %s", reason)
            current_step = "step_on"
            last = None
            stable_since = None
            hold_bar_since = None
            weight_profile_sent = False
            saw_nonzero_z = False
            saw_a7 = False
            saw_lock = False
            bia_stalled_warned = False
            done_weight = None
            last_ba_weight = None
            queue.put_nowait(
                {
                    "type": "STEP",
                    "step": "step_on",
                    "msg": reason,
                    "reset": True,
                }
            )

        def step(step_id: str, msg: str) -> None:
            nonlocal current_step, hold_bar_since
            try:
                new_idx = STEP_ORDER.index(step_id)
                cur_idx = STEP_ORDER.index(current_step)
            except ValueError:
                return
            if new_idx < cur_idx:
                logger.info("icomon step ignorado (não volta): %s -> %s", current_step, step_id)
                return
            if new_idx == cur_idx:
                queue.put_nowait({"type": "STEP", "step": step_id, "msg": msg})
                return
            current_step = step_id
            if step_id == "hold_bar" and hold_bar_since is None:
                hold_bar_since = time.monotonic()
            logger.info("icomon STEP -> %s | %s", step_id, msg)
            queue.put_nowait({"type": "STEP", "step": step_id, "msg": msg})

        def schedule_write(frames: list[bytes], label: str) -> None:
            pending_writes.put_nowait((label, frames))

        async def write_frames(frames: list[bytes], label: str) -> list[dict]:
            client = client_holder.get("client")
            results: list[dict] = []
            topic = "memory" if ("BB-" in label or "C0" in label or "C1" in label) else None
            if client is None or not client.is_connected:
                miss = {
                    "ok": False,
                    "error": "sem conexão GATT",
                    "label": label,
                }
                logger.warning("icomon FFB1 write %s abortado: sem conexão", label)
                queue.put_nowait(
                    {
                        "type": "DEBUG",
                        "topic": topic,
                        "msg": f"FFB1 write {label} FALHOU (sem conexão)",
                        "ok": False,
                    }
                )
                return [miss]
            async with write_lock:
                for frame in frames:
                    envelope = "openscale-20B" if len(frame) == 20 else f"nativo-{len(frame)}B"
                    entry: dict = {
                        "ok": False,
                        "hex": frame.hex(),
                        "len": len(frame),
                        "envelope": envelope,
                        "label": label,
                    }
                    try:
                        logger.info("icomon FFB1 write %s %s hex=%s", label, envelope, frame.hex())
                        mode = "com-resposta"
                        try:
                            await client.write_gatt_char(FFB1_UUID, frame, response=True)
                        except BleakError:
                            await client.write_gatt_char(FFB1_UUID, frame, response=False)
                            mode = "sem-resposta"
                        entry["ok"] = True
                        entry["ble_ack"] = mode
                        results.append(entry)
                        queue.put_nowait(
                            {
                                "type": "DEBUG",
                                "topic": topic,
                                "channel": "FFB1",
                                "msg": f"FFB1 write {label} OK ({envelope}, {mode})",
                                "hex": frame.hex(),
                                "envelope": envelope,
                                "ble_ack": mode,
                                "ok": True,
                            }
                        )
                    except BleakError as exc:
                        entry["error"] = str(exc)
                        results.append(entry)
                        logger.warning("FFB1 write falhou (%s): %s", label, exc)
                        queue.put_nowait(
                            {
                                "type": "DEBUG",
                                "topic": topic,
                                "channel": "FFB1",
                                "msg": f"FFB1 write {label} FALHOU ({envelope}): {exc}",
                                "hex": frame.hex(),
                                "envelope": envelope,
                                "ok": False,
                                "error": str(exc),
                            }
                        )
            return results

        def next_seq() -> int:
            nonlocal seq
            value = seq
            seq = (seq + 1) & 0xFFFF
            return value

        def ack_control(raw: bytes) -> None:
            nonlocal reply_idx
            # A0/A7/AA: a balança espera B0 para manter a sessão “viva”.
            frames = encode_reply(next_seq(), reply_idx)
            reply_idx = (reply_idx + 1) & 0xFF
            schedule_write(frames, f"B0-ack/{frame_seq(raw)}")

        async def send_debug(msg: str, **extra) -> None:
            logger.info("icomon DEBUG %s %s", msg, extra or "")
            payload = {"type": "DEBUG", "msg": msg, **extra}
            try:
                await websocket.send_json(payload)
            except Exception:
                queue.put_nowait(payload)

        def emit(reading: ScaleReading | None) -> None:
            nonlocal last, stable_since, saw_nonzero_z, saw_a7, done_weight
            if reading is None:
                return

            if current_step == "done":
                if reading.peso_kg < 8.0:
                    reset_session("Pessoa desceu. Próxima pode subir (atualize altura/idade/sexo).")
                    return
                if (
                    done_weight is not None
                    and reading.peso_kg >= 20.0
                    and abs(reading.peso_kg - done_weight) >= 5.0
                    and reading.estavel
                ):
                    reset_session(
                        f"Novo peso detectado ({reading.peso_kg:.1f} kg). "
                        "Reiniciando — atualize o perfil se for outra pessoa."
                    )
                elif reading.completo and reading.impedancias_ohm:
                    last = reading
                    dispatch(reading)
                    return
                else:
                    return

            if reading.fonte == "ffb3":
                saw_a7 = True

            if reading.fonte == "ffb3" and not reading.completo:
                nonzero = sum(1 for z in reading.impedancias_ohm if z >= 40)
                if nonzero == 0:
                    logger.info("icomon A7 só-pés Z=%s", reading.impedancias_ohm)
                    queue.put_nowait(
                        {
                            "type": "STATUS",
                            "msg": (
                                f"A7 de {reading.peso_kg:.1f} kg sem impedância. "
                                + (
                                    "A balança travou o peso mas não fechou a corrente: "
                                    "confira as duas mãos na barra, polegares e palmas no metal, "
                                    "braços afastados do corpo."
                                    if saw_lock
                                    else "A balança nem chegou a travar o peso (status ficou 0x01), "
                                    "o que indica contato ruim dos pés: pé totalmente descalço, "
                                    "calcanhar e planta sobre os quatro contatos metálicos, "
                                    "sola levemente úmida."
                                )
                            ),
                        }
                    )
                    # A balança já fechou o ciclo: sem impedância ela não tenta de novo
                    # nesta sessão. Encerramos como "somente peso" em vez de deixar a
                    # pessoa presa esperando um A7 que não vem.
                    last = ScaleReading(
                        peso_kg=reading.peso_kg,
                        estavel=True,
                        completo=False,
                        fonte="ffb3",
                        etapa="done",
                    )
                    done_weight = reading.peso_kg
                    step(
                        "done",
                        f"Medição encerrada com {reading.peso_kg:.1f} kg — somente peso. "
                        "A balança não conseguiu ler os eletrodos desta vez.",
                    )
                    dispatch(last)
                    return
                saw_nonzero_z = True

            if (
                last is not None
                and not reading.completo
                and abs(reading.peso_kg - last.peso_kg) < 0.05
                and reading.estavel == last.estavel
                and reading.completo == last.completo
                and reading.impedancias_ohm == last.impedancias_ohm
            ):
                if reading.estavel and stable_since is None:
                    stable_since = time.monotonic()
                return

            last = reading
            dispatch(reading)
            logger.info(
                "icomon reading peso=%.3f estavel=%s completo=%s fonte=%s z=%s step=%s",
                reading.peso_kg,
                reading.estavel,
                reading.completo,
                reading.fonte,
                reading.impedancias_ohm,
                current_step,
            )

            if reading.completo:
                done_weight = reading.peso_kg
                if current_step in {"step_on", "wait_stable"}:
                    step("hold_bar", "Dados da barra recebidos. Confirmando medição...")
                if current_step in {"hold_bar", "extend_bar"}:
                    step("measuring", "Lendo sensores das mãos e dos pés...")
                step("done", "Medição dos 8 eletrodos concluída. Veja o relatório ao lado.")
                return

            if reading.fonte == "ffb3" and reading.impedancias_ohm:
                hint = quality_hint(reading.impedancias_ohm)
                if current_step in {"step_on", "wait_stable"}:
                    step(
                        "hold_bar",
                        "A balança começou a ler os sensores — segure a barra firme e não se mexa.",
                    )
                step("measuring", hint)
                return

            if reading.peso_kg > 0 and not reading.estavel:
                stable_since = None
                if current_step in {"step_on", "wait_stable"}:
                    step(
                        "wait_stable",
                        "Segurando a barra, fique parado até o peso travar.",
                    )
                return

            if reading.estavel and stable_since is None:
                stable_since = time.monotonic()

        def on_ffb2(_sender, data: bytearray) -> None:
            raw = bytes(data)
            reading = ingest_frame(ffb2_asm, raw)
            logger.info(
                "icomon FFB2 hex=%s parsed=%s",
                raw.hex(),
                None if reading is None else f"{reading.peso_kg}kg estavel={reading.estavel}",
            )
            nonlocal saw_lock
            # byte 5 do frame nativo: 0x01 medindo, 0x02/0x03 travado, 0x00 final.
            status = raw[5] if len(raw) > 5 else None
            if status in {0x02, 0x03}:
                saw_lock = True
            label = {
                0x00: "final",
                0x01: "medindo",
                0x02: "travado",
                0x03: "travado+bia",
            }.get(status, "?")
            queue.put_nowait(
                {
                    "type": "DEBUG",
                    "channel": "FFB2",
                    "msg": f"FFB2 status=0x{status:02x} ({label}) hex={raw.hex()}"
                    if status is not None
                    else f"FFB2 hex={raw.hex()}",
                    "hex": raw.hex(),
                    "a2_status": status,
                    "a2_status_label": label,
                    "parsed_kg": None if reading is None else reading.peso_kg,
                    "estavel": None if reading is None else reading.estavel,
                    "step": current_step,
                }
            )
            emit(reading)

        def on_ffb3(_sender, data: bytearray) -> None:
            raw = bytes(data)
            # ACK imediato — sem isso a balança pode não liberar/repetir a BIA.
            if len(raw) >= 5 and raw[4] in {0xA0, 0xA1, 0xA7, 0xAA, 0xA3}:
                ack_control(raw)

            reading = ingest_frame(ffb3_asm, raw)
            logger.info(
                "icomon FFB3 hex=%s parsed=%s",
                raw.hex(),
                None
                if reading is None
                else f"{reading.peso_kg}kg z={reading.impedancias_ohm} completo={reading.completo}",
            )
            frame_type = f"0x{raw[4]:02x}" if len(raw) > 4 else None
            zs = None if reading is None else reading.impedancias_ohm
            zeros = sum(1 for z in zs if z < 5) if zs else 0
            since_clear = (
                round(time.monotonic() - memory_cleared_at, 2)
                if memory_cleared_at is not None
                else None
            )
            queue.put_nowait(
                {
                    "type": "DEBUG",
                    "channel": "FFB3",
                    "msg": f"FFB3 {frame_type} hex={raw.hex()}",
                    "hex": raw.hex(),
                    "frame_type": frame_type,
                    "parsed_kg": None if reading is None else reading.peso_kg,
                    "z": zs,
                    "z_count": 0 if zs is None else len(zs),
                    "z_zeros": zeros,
                    "completo": None if reading is None else reading.completo,
                    "step": current_step,
                    "bia_started": bool(zs and zeros < 6),
                    "seconds_since_clear": since_clear,
                }
            )
            if frame_type in {"0xa7", "0xa3"} and since_clear is not None:
                started = bool(zs and zeros < 6)
                queue.put_nowait(
                    {
                        "type": "DEBUG",
                        "topic": "memory",
                        "phase": "scale_reply",
                        "msg": (
                            f"MEMÓRIA: A7 {since_clear:.1f}s após BB-clear — "
                            + (
                                "BIA veio (lista não impediu a corrente)."
                                if started
                                else "A7 com os 10 canais zerados — a BIA não rodou."
                            )
                        ),
                        "frame_type": frame_type,
                        "seconds_since_clear": since_clear,
                        "bia_started": started,
                        "z_zeros": zeros,
                        "parsed_kg": None if reading is None else reading.peso_kg,
                    }
                )
            emit(reading)

        async def link_session(target) -> None:
            """Uma conexão. Retorna quando a balança desliga; o supervisor reconecta."""
            nonlocal reply_idx, last_ba_at, last_ba_weight, last_sync_token, weight_profile_sent, bia_stalled_warned

            async with BleakClient(target, timeout=CONNECT_TIMEOUT_S) as client:
                client_holder["client"] = client
                await send_status("Conexão ICOMON estabelecida.")
                await send_debug(f"Conectado a {spec.address}")
                try:
                    await client.start_notify(FFB2_UUID, on_ffb2)
                    await send_debug("Notify FFB2 (peso ao vivo) ativo")
                except BleakError as exc:
                    await send_status(f"Falha ao assinar FFB2: {exc}")
                    return
                try:
                    await client.start_notify(FFB3_UUID, on_ffb3)
                    await send_debug("Indicate FFB3 (relatório completo) ativo")
                except BleakError as exc:
                    logger.warning("FFB3 indicate indisponível: %s", exc)
                    await send_status("FFB3 indisponível; só peso ao vivo.")
                    await send_debug(f"FFB3 falhou: {exc}")

                # BD/B0 nativos + BA convidado (openScale). Sem gravar P-1.
                try:
                    await write_frames(encode_other(next_seq()), "BD")
                    await write_frames(encode_reply(next_seq(), reply_idx), "B0")
                    reply_idx = (reply_idx + 1) & 0xFF
                    prof0 = active_profile()
                    if prof0 is not None:
                        await push_profile_to_scale("init", stabilized=False, reset_memory=False)
                        last_ba_at = time.monotonic()
                    last_sync_token = sync_token_box[0]
                except Exception as exc:
                    logger.warning("Handshake FFB1 parcial: %s", exc)

                step(
                    "step_on",
                    "Suba descalço e PEGUE A BARRA NO MESMO MOVIMENTO, com as duas mãos. "
                    "Se subir sem a barra, a balança decide medir só o peso.",
                )

                while client.is_connected:
                    # Drena writes agendados (ACKs) sem bloquear o heartbeat.
                    while not pending_writes.empty():
                        label, frames = pending_writes.get_nowait()
                        await write_frames(frames, label)

                    await asyncio.sleep(0.2)
                    now = time.monotonic()

                    # Troca de pessoa na Cabine: só reenvia BA (altura/idade/sexo)
                    # para o WLA25 da próxima leitura. Sem tocar na EEPROM.
                    if sync_token_box[0] != last_sync_token:
                        last_sync_token = sync_token_box[0]
                        weight_profile_sent = False
                        if last is not None and last.peso_kg >= 10:
                            await send_status(
                                "Há alguém no prato — não reenvio perfil agora para não cortar a BIA."
                            )
                        else:
                            if current_step == "done":
                                reset_session("Novo perfil aplicado — próxima pessoa.")
                            await push_profile_to_scale(
                                "apply",
                                stabilized=False,
                                reset_memory=not MINIMAL_SESSION,
                            )

                    if (
                        last is not None
                        and last.estavel
                        and current_step in {"step_on", "wait_stable"}
                        and stable_since is not None
                        and now - stable_since >= 1.2
                    ):
                        step(
                            "hold_bar",
                            "Peso travado. Mantenha a barra firme, polegares nos eletrodos.",
                        )

                    if (
                        current_step == "hold_bar"
                        and hold_bar_since is not None
                        and now - hold_bar_since >= 3.5
                        and not saw_nonzero_z
                    ):
                        step(
                            "extend_bar",
                            "Estique os braços ~40° à frente, sem encostar a barra no corpo, e aguarde a corrente.",
                        )

                    # Alinha BA ao quilo ao vivo (sem BD). 60 kg vs 54 kg faz a firmware
                    # mandar A7 zerado — a regra dela é ±2 kg.
                    if (
                        not MINIMAL_SESSION
                        and last is not None
                        and last.peso_kg >= 20
                        and current_step != "done"
                        and not saw_a7
                        and now - last_ba_at >= 0.8
                        and (
                            last_ba_weight is None
                            or abs(last.peso_kg - last_ba_weight) >= 1.5
                        )
                    ):
                        prof_live = active_profile()
                        if prof_live is not None:
                            previous = last_ba_weight
                            await write_frames(
                                encode_profile_sync(
                                    next_seq(),
                                    height_cm=prof_live.height_cm,
                                    age=prof_live.age,
                                    sex=prof_live.sex,
                                    weight_kg=last.peso_kg,
                                    stabilized=last.estavel,
                                    user_id=GUEST_USER_ID,
                                    people_type=prof_live.people_type,
                                    native_only=True,
                                ),
                                "BA-live",
                            )
                            last_ba_at = now
                            last_ba_weight = last.peso_kg
                            await send_debug(
                                f"BA ao vivo {last.peso_kg:.1f} kg (sem BD)",
                                topic="memory",
                                phase="ba_live",
                                live_kg=last.peso_kg,
                                previous_session_kg=previous,
                                delta_kg=(
                                    abs(last.peso_kg - previous) if previous is not None else None
                                ),
                            )
                            await send_status(
                                f"Sessão alinhada a {last.peso_kg:.1f} kg. Mantenha a barra."
                            )

                    if (
                        not bia_stalled_warned
                        and not saw_a7
                        and not saw_nonzero_z
                        and last is not None
                        and last.estavel
                        and last.peso_kg >= 20
                        and stable_since is not None
                        and now - stable_since >= 12.0
                        and current_step in {"step_on", "wait_stable", "hold_bar", "extend_bar"}
                    ):
                        bia_stalled_warned = True
                        reason = (
                            "Peso travado sem A7. Mantenha a barra; se já soltou, desça e suba "
                            "já segurando."
                        )
                        await send_status(reason)
                        await send_debug(
                            "BIA não iniciou",
                            live_kg=last.peso_kg,
                            saw_a7=saw_a7,
                        )

                    # Heartbeat só com prato vazio. Durante a pesagem o rádio fica livre para A7.
                    prof = active_profile()
                    idle = last is None or last.peso_kg < 10
                    hb_weight = profile_weight(prof, None) if prof is not None else None
                    if (
                        not MINIMAL_SESSION
                        and prof is not None
                        and hb_weight is not None
                        and current_step != "done"
                        and idle
                        and now - last_ba_at >= BA_HEARTBEAT_S
                    ):
                        await write_frames(
                            encode_profile_sync(
                                next_seq(),
                                height_cm=prof.height_cm,
                                age=prof.age,
                                sex=prof.sex,
                                weight_kg=hb_weight,
                                stabilized=False,
                                user_id=GUEST_USER_ID,
                                people_type=prof.people_type,
                            ),
                            "BA-hb",
                        )
                        last_ba_at = now
                        last_ba_weight = hb_weight

        # A balança desliga o rádio com a plataforma vazia (~15 s). Sem religar,
        # quando a pessoa sobe ela mede sozinha em modo offline — e aí só
        # reconhece quem já está gravado na memória dela.
        consumer = asyncio.create_task(_consume_queue(websocket, queue))
        try:
            while True:
                if consumer.done():
                    await consumer
                    return

                target = await wait_for_advertising(
                    spec.address, consumer, send_status, send_debug
                )
                if target is None or consumer.done():
                    if consumer.done():
                        await consumer
                    return

                try:
                    await link_session(target)
                    reason = "Balança desligou (plataforma vazia)."
                except (BleakError, OSError, asyncio.TimeoutError) as exc:
                    reason = f"{type(exc).__name__}: {exc}"
                finally:
                    client_holder["client"] = None

                if consumer.done():
                    await consumer
                    return

                await send_debug(f"Link caiu — {reason}")
                await send_status(
                    "Rádio caiu. Mantenha-se na balança — procurando o anúncio de novo."
                )
                queue.put_nowait({"type": "LINK", "connected": False, "msg": reason})

                await asyncio.sleep(RECONNECT_DELAY_S)
                if current_step == "done":
                    reset_session("Reconectado — pode subir.")
        finally:
            client_holder["client"] = None
            consumer.cancel()
            try:
                await consumer
            except asyncio.CancelledError:
                pass


async def _consume_queue(websocket: WebSocket, queue: asyncio.Queue) -> None:
    while True:
        data = await queue.get()
        await websocket.send_json(data)
