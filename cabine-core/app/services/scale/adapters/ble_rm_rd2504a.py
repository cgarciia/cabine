import asyncio
import logging
import time
from dataclasses import replace

from bleak import BleakClient, BleakError, BleakScanner
from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.services.scale.adapters.base import DispatchFn, ScaleAdapter, StatusFn
from app.services.ble import normalize_mac
from app.services.scale.rm_rd2504a import (
    FFB1_UUID,
    FFB2_UUID,
    FFB3_UUID,
    GUEST_USER_ID,
    RmRd2504aAssembler,
    encode_c0_profile,
    encode_c1_users,
    encode_clear_users,
    encode_other,
    encode_profile_sync,
    encode_reply,
    frame_seq,
    has_bia_impedances,
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

# Native C0/C1 handshake captured on this firmware. Composition (WLA25) stays in Cabine.
MINIMAL_SESSION = True

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
            await asyncio.sleep(0.4)
            continue
        if device is not None:
            await send_status("Balança encontrada. Conectando...")
            return device
        if round_n == 8:
            await send_status(
                "Ainda sem sinal. Pise nela (ou toque com o pé) e feche o app da balança no celular."
            )
        elif round_n % 12 == 0:
            await send_status("Aguardando a balança. Pise nela agora para acordar.")
    return None


class BleRmRd2504aAdapter(ScaleAdapter):
    key = "ble_rm_rd2504a"
    label = "BLE GATT RM-RD2504A (FFB0)"
    address_kind = "mac"
    address_label = "Endereço MAC"
    parsers = ("rm_rd2504a_ffb2",)
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
        ffb2_asm = RmRd2504aAssembler()
        ffb3_asm = RmRd2504aAssembler()
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
            nonlocal last_ba_at, last_ba_weight
            prof = active_profile()
            if prof is None:
                return
            weight = profile_weight(prof, live_kg)
            on_platform = last is not None and last.weight_kg >= 10
            if on_platform:
                await send_status(
                    "Desça da balança primeiro. Depois suba de novo para medir."
                )
                return

            if MINIMAL_SESSION:
                # Captured handshake: B0 + C0(name) + C1(list) + C0.
                # openScale BA/BB does not unlock BIA on this firmware — only C0/C1.
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
                await send_status(
                    f"Dados confirmados. Segure a barra e suba na balança."
                )
                return

            await write_frames(encode_other(next_seq()), f"BD-{label}")
            await write_frames(encode_reply(next_seq(), 0), f"B0-{label}")
            if reset_memory:
                clear_frames = encode_clear_users(next_seq())
                await write_frames(clear_frames, f"BB-clear-{label}")
            if weight is None:
                await send_status(
                    "Suba segurando a barra. A medição começa sozinha."
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
            await send_status(
                f"Sessão convidado: {weight:.1f} kg · {prof.height_cm:.0f} cm · "
                f"{prof.age} anos. Pegue a barra e suba (peso ao vivo precisa ficar a ±2 kg disso)."
            )

        def reset_session(reason: str) -> None:
            nonlocal current_step, last, stable_since, hold_bar_since
            nonlocal weight_profile_sent, saw_nonzero_z, saw_a7, saw_lock, bia_stalled_warned, done_weight
            nonlocal last_ba_weight
            logger.info("rm_rd2504a reset sessão: %s", reason)
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
                logger.info("rm_rd2504a step ignorado (não volta): %s -> %s", current_step, step_id)
                return
            if new_idx == cur_idx:
                queue.put_nowait({"type": "STEP", "step": step_id, "msg": msg})
                return
            current_step = step_id
            if step_id == "hold_bar" and hold_bar_since is None:
                hold_bar_since = time.monotonic()
            logger.info("rm_rd2504a STEP -> %s | %s", step_id, msg)
            queue.put_nowait({"type": "STEP", "step": step_id, "msg": msg})

        def schedule_write(frames: list[bytes], label: str) -> None:
            pending_writes.put_nowait((label, frames))

        async def write_frames(frames: list[bytes], label: str) -> list[dict]:
            client = client_holder.get("client")
            results: list[dict] = []
            if client is None or not client.is_connected:
                logger.warning("rm_rd2504a FFB1 write %s abortado: sem conexão", label)
                return [{"ok": False, "error": "sem conexão GATT", "label": label}]
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
                        logger.debug("rm_rd2504a FFB1 write %s %s hex=%s", label, envelope, frame.hex())
                        mode = "com-resposta"
                        try:
                            await client.write_gatt_char(FFB1_UUID, frame, response=True)
                        except BleakError:
                            await client.write_gatt_char(FFB1_UUID, frame, response=False)
                            mode = "sem-resposta"
                        entry["ok"] = True
                        entry["ble_ack"] = mode
                        results.append(entry)
                    except BleakError as exc:
                        entry["error"] = str(exc)
                        results.append(entry)
                        logger.warning("FFB1 write falhou (%s): %s", label, exc)
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

        def emit(reading: ScaleReading | None) -> None:
            nonlocal last, stable_since, saw_nonzero_z, saw_a7, done_weight
            if reading is None:
                return

            # Desceu no meio ou depois do A7: reinicia. Não trava em "somente peso".
            if (
                reading.source == "ffb2"
                and reading.weight_kg < 8.0
                and current_step != "step_on"
                and last is not None
                and last.weight_kg >= 20
            ):
                reset_session("Você desceu. Pode subir de novo quando quiser.")
                return

            if current_step == "done":
                if (
                    done_weight is not None
                    and reading.weight_kg >= 20.0
                    and abs(reading.weight_kg - done_weight) >= 5.0
                    and reading.stable
                ):
                    reset_session(
                        "Nova pesagem detectada. Aguarde a leitura."
                    )
                else:
                    if reading.source == "ffb3" and has_bia_impedances(reading.impedances_ohm):
                        reading = replace(reading, complete=True, step="done")
                        last = reading
                        dispatch(reading)
                        logger.info(
                            "rm_rd2504a A7 BIA após done peso=%.3f Z=%s",
                            reading.weight_kg,
                            reading.impedances_ohm,
                        )
                    return

            if reading.source == "ffb3":
                saw_a7 = True
                if has_bia_impedances(reading.impedances_ohm):
                    saw_nonzero_z = True
                    reading = replace(reading, complete=True, step="done")
                else:
                    logger.info("rm_rd2504a A7 sem corrente Z=%s — aguardando A7 de membros", reading.impedances_ohm)
                    queue.put_nowait(
                        {
                            "type": "STATUS",
                            "msg": (
                                f"A7 de {reading.weight_kg:.1f} kg ainda sem bioimpedância. "
                                "Mantenha as duas mãos na barra; a balança ainda pode enviar os canais."
                            ),
                        }
                    )
                    last = reading
                    dispatch(reading)
                    return

            if (
                last is not None
                and not reading.complete
                and abs(reading.weight_kg - last.weight_kg) < 0.05
                and reading.stable == last.stable
                and reading.complete == last.complete
                and reading.impedances_ohm == last.impedances_ohm
            ):
                if reading.stable and stable_since is None:
                    stable_since = time.monotonic()
                return

            last = reading
            dispatch(reading)
            logger.info(
                "rm_rd2504a reading weight=%.3f stable=%s complete=%s source=%s z=%s step=%s",
                reading.weight_kg,
                reading.stable,
                reading.complete,
                reading.source,
                reading.impedances_ohm,
                current_step,
            )

            if reading.complete:
                done_weight = reading.weight_kg
                if current_step in {"step_on", "wait_stable"}:
                    step("hold_bar", "Confirmando a medição…")
                if current_step in {"hold_bar", "extend_bar"}:
                    step("measuring", "Lendo o corpo. Fique parado.")
                step("done", "Medição concluída. Desça da balança.")
                return

            if reading.source == "ffb3" and reading.impedances_ohm:
                hint = quality_hint(reading.impedances_ohm)
                if current_step in {"step_on", "wait_stable"}:
                    step(
                        "hold_bar",
                        "Segure a barra firme e não se mexa.",
                    )
                # quality_hint pode trazer ohms — preferir mensagem simples no totem
                step(
                    "measuring",
                    "Lendo o corpo. Mantenha pés e mãos no lugar."
                    if hint and ("Ω" in hint or "ohm" in hint.lower() or "Z=" in hint)
                    else (hint or "Lendo o corpo. Fique parado."),
                )
                return

            if reading.weight_kg > 0 and not reading.stable:
                stable_since = None
                if current_step in {"step_on", "wait_stable"}:
                    step(
                        "wait_stable",
                        "Segurando a barra, fique parado até o peso travar.",
                    )
                return

            if reading.stable and stable_since is None:
                stable_since = time.monotonic()

        def on_ffb2(_sender, data: bytearray) -> None:
            raw = bytes(data)
            reading = ingest_frame(ffb2_asm, raw)
            logger.debug(
                "rm_rd2504a FFB2 hex=%s parsed=%s",
                raw.hex(),
                None if reading is None else f"{reading.weight_kg}kg stable={reading.stable}",
            )
            nonlocal saw_lock
            status = raw[5] if len(raw) > 5 else None
            if status in {0x02, 0x03}:
                saw_lock = True
            emit(reading)

        def on_ffb3(_sender, data: bytearray) -> None:
            raw = bytes(data)
            # ACK imediato — sem isso a balança pode não liberar/repetir a BIA.
            if len(raw) >= 5 and raw[4] in {0xA0, 0xA1, 0xA7, 0xAA, 0xA3}:
                ack_control(raw)

            reading = ingest_frame(ffb3_asm, raw)
            logger.debug(
                "rm_rd2504a FFB3 hex=%s parsed=%s",
                raw.hex(),
                None
                if reading is None
                else f"{reading.weight_kg}kg z={reading.impedances_ohm} complete={reading.complete}",
            )
            emit(reading)

        async def link_session(target) -> None:
            """Uma conexão. Retorna quando a balança desliga; o supervisor reconecta."""
            nonlocal reply_idx, last_ba_at, last_ba_weight, last_sync_token, weight_profile_sent, bia_stalled_warned

            async with BleakClient(target, timeout=CONNECT_TIMEOUT_S) as client:
                client_holder["client"] = client
                await send_status("Balança conectada.")
                try:
                    await client.start_notify(FFB2_UUID, on_ffb2)
                except BleakError as exc:
                    logger.warning("Falha ao assinar FFB2: %s", exc)
                    await send_status("Não foi possível conectar. Aguarde e tente de novo.")
                    return
                try:
                    await client.start_notify(FFB3_UUID, on_ffb3)
                except BleakError as exc:
                    logger.warning("FFB3 indicate indisponível: %s", exc)
                    await send_status("Balança pronta para pesar.")

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
                    "Suba descalço segurando a barra com as duas mãos.",
                )

                while client.is_connected and websocket.client_state == WebSocketState.CONNECTED:
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
                        if last is not None and last.weight_kg >= 10:
                            await send_status(
                                "Desça da balança antes de continuar."
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
                        and last.stable
                        and current_step in {"step_on", "wait_stable"}
                        and stable_since is not None
                        and now - stable_since >= 1.2
                    ):
                        step(
                            "hold_bar",
                            "Peso confirmado. Segure a barra firme e fique parado.",
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
                        and last.weight_kg >= 20
                        and current_step != "done"
                        and not saw_a7
                        and now - last_ba_at >= 0.8
                        and (
                            last_ba_weight is None
                            or abs(last.weight_kg - last_ba_weight) >= 1.5
                        )
                    ):
                        prof_live = active_profile()
                        if prof_live is not None:
                            await write_frames(
                                encode_profile_sync(
                                    next_seq(),
                                    height_cm=prof_live.height_cm,
                                    age=prof_live.age,
                                    sex=prof_live.sex,
                                    weight_kg=last.weight_kg,
                                    stabilized=last.stable,
                                    user_id=GUEST_USER_ID,
                                    people_type=prof_live.people_type,
                                    native_only=True,
                                ),
                                "BA-live",
                            )
                            last_ba_at = now
                            last_ba_weight = last.weight_kg
                            await send_status(
                                f"Sessão alinhada a {last.weight_kg:.1f} kg. Mantenha a barra."
                            )

                    if (
                        not bia_stalled_warned
                        and not saw_a7
                        and not saw_nonzero_z
                        and last is not None
                        and last.stable
                        and last.weight_kg >= 20
                        and stable_since is not None
                        and now - stable_since >= 12.0
                        and current_step in {"step_on", "wait_stable", "hold_bar", "extend_bar"}
                    ):
                        bia_stalled_warned = True
                        reason = (
                            "Mantenha as mãos na barra. Se soltou, desça e suba novamente segurando a barra."
                        )
                        await send_status(reason)

                    # Heartbeat só com prato vazio. Durante a pesagem o rádio fica livre para A7.
                    prof = active_profile()
                    idle = last is None or last.weight_kg < 10
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
            while websocket.client_state == WebSocketState.CONNECTED:
                if consumer.done():
                    await consumer
                    return

                target = await wait_for_advertising(
                    spec.address, consumer, send_status
                )
                if (
                    target is None
                    or consumer.done()
                    or websocket.client_state != WebSocketState.CONNECTED
                ):
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

                if (
                    consumer.done()
                    or websocket.client_state != WebSocketState.CONNECTED
                ):
                    if consumer.done():
                        await consumer
                    return

                await send_status(
                    "Conexão interrompida. Fique na balança — reconectando…"
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
    while websocket.client_state == WebSocketState.CONNECTED:
        try:
            data = await asyncio.wait_for(queue.get(), timeout=0.4)
        except TimeoutError:
            continue
        try:
            await websocket.send_json(data)
        except Exception:
            return
