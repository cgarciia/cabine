import asyncio
import logging
from datetime import datetime
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect

from app.core.database import AsyncSessionLocal
from app.crud import scale as scale_crud
from app.services.scale.metrics import PersonProfile, compute_report
from app.services.scale.persist import save_from_scale_event
from app.services.scale.reading import ScaleReading
from app.services.scale.registry import get_adapter, resolve_parser
from app.services.scale.spec import ScaleSpec

logger = logging.getLogger(__name__)


async def _load_scale_spec(scale_id: UUID | None) -> tuple[ScaleSpec | None, str | None]:
    """Busca a balança e libera a conexão do pool antes do stream BLE longo."""
    async with AsyncSessionLocal() as db:
        if scale_id is not None:
            record = await scale_crud.get_by_id(db, scale_id)
        else:
            record = await scale_crud.get_default(db)

        if record is None:
            return None, "Nenhuma balança cadastrada. Cadastre uma na tela de balanças."

        if not record.is_active:
            return None, f"A balança '{record.name}' está inativa."

        return scale_crud.to_spec(record), None


def _as_uuid(value) -> UUID | None:
    if value is None or value == "":
        return None
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _profile_from_payload(
    height_cm=None,
    age=None,
    sex=None,
    *,
    expected_weight_kg=None,
    people_type=None,
    birth_date=None,
    display_name=None,
) -> PersonProfile | None:
    return PersonProfile.from_params(
        height_cm,
        age,
        sex,
        expected_weight_kg=expected_weight_kg,
        people_type=people_type,
        birth_date=birth_date,
        display_name=display_name,
    )


async def stream_scale(
    websocket: WebSocket,
    scale_id: UUID | None = None,
    height_cm: float | None = None,
    age: int | None = None,
    sex: str | None = None,
    expected_weight_kg: float | None = None,
    people_type: str | None = None,
    birth_date: str | None = None,
    display_name: str | None = None,
    person_id: UUID | None = None,
) -> None:
    await websocket.accept()

    spec, error = await _load_scale_spec(scale_id)
    if error or spec is None:
        await websocket.send_json({"type": "STATUS", "msg": error})
        await websocket.close()
        return

    profile_box: list[PersonProfile | None] = [
        _profile_from_payload(
            height_cm,
            age,
            sex,
            expected_weight_kg=expected_weight_kg,
            people_type=people_type,
            birth_date=birth_date,
            display_name=display_name,
        )
    ]
    profile_sync_box: list[int] = [0]
    person_id_box: list[UUID | None] = [person_id]
    last_reading_box: list[dict | None] = [None]
    saved_keys: set[tuple] = set()

    def schedule_save(item: dict) -> None:
        pid = person_id_box[0]
        if pid is None:
            logger.warning("Medição não salva: nenhuma pessoa na sessão")
            return
        try:
            peso = round(float(item.get("peso_kg") or 0), 2)
        except (TypeError, ValueError):
            return
        if peso < 10:
            return
        key = (str(pid), peso, bool(item.get("completo")))
        if key in saved_keys:
            return
        saved_keys.add(key)

        async def _run() -> None:
            try:
                await save_from_scale_event(person_id=pid, scale_id=spec.id, payload=item)
            except Exception:
                saved_keys.discard(key)
                logger.exception("Falha ao salvar medição no banco")

        asyncio.create_task(_run())

    class SaveQueue:
        def __init__(self, inner: asyncio.Queue):
            self._inner = inner

        def put_nowait(self, item: dict) -> None:
            if isinstance(item, dict):
                if item.get("type") == "PESO_RECEBIDO":
                    last_reading_box[0] = item
                    if item.get("completo"):
                        schedule_save(item)
                elif item.get("type") == "STEP" and item.get("reset") and last_reading_box[0]:
                    schedule_save(last_reading_box[0])
                    last_reading_box[0] = None
            self._inner.put_nowait(item)

        def get(self):
            return self._inner.get()

    try:
        adapter = get_adapter(spec.adapter)
        parse = resolve_parser(spec)
    except ValueError as exc:
        await websocket.send_json({"type": "STATUS", "msg": str(exc)})
        await websocket.close()
        return

    inner_queue: asyncio.Queue[dict] = asyncio.Queue()
    queue = SaveQueue(inner_queue)
    last_signature: tuple | None = None

    def dispatch(reading: ScaleReading | float | None) -> None:
        nonlocal last_signature
        if reading is None:
            return
        if isinstance(reading, (int, float)):
            reading = ScaleReading(peso_kg=float(reading))
        if reading.peso_kg <= 0:
            return

        signature = (
            round(reading.peso_kg, 2),
            reading.estavel,
            reading.completo,
            tuple(reading.impedancias_ohm),
        )
        if signature == last_signature:
            return
        last_signature = signature

        payload: dict = {
            "type": "PESO_RECEBIDO",
            "scale_id": str(spec.id),
            "adapter": spec.adapter,
            "balanca_nome": spec.name,
            "supports_bia": adapter.supports_bia,
            "peso_kg": reading.peso_kg,
            "estavel": reading.estavel,
            "completo": reading.completo,
            "fonte": reading.fonte,
            "timestamp": datetime.now().strftime("%H:%M:%S"),
        }
        use_bia = adapter.supports_bia
        if use_bia and reading.impedancias_ohm:
            payload["impedancias_ohm"] = reading.impedancias_ohm
        if use_bia and reading.segmentos:
            payload["segmentos"] = [
                {
                    "nome": item.nome,
                    "lado": item.lado,
                    "freq_khz": item.freq_khz,
                    "ohm": item.ohm,
                }
                for item in reading.segmentos
            ]
        if reading.etapa:
            payload["etapa"] = reading.etapa
        profile = profile_box[0]
        if profile is not None:
            use_z = use_bia and reading.completo
            payload["metricas"] = compute_report(
                reading.peso_kg,
                profile,
                impedancias_ohm=reading.impedancias_ohm if use_z else None,
                segmentos=reading.segmentos if use_z else None,
            )
            payload["perfil"] = {
                "altura_cm": profile.height_cm,
                "idade": profile.age,
                "sexo": profile.sex,
                "peso_esperado_kg": profile.expected_weight_kg,
                "tipo": profile.people_type,
                "nascimento": profile.birth_date.isoformat() if profile.birth_date else None,
            }
        queue.put_nowait(payload)

    async def send_status(msg: str) -> None:
        await websocket.send_json({"type": "STATUS", "msg": msg})

    async def listen_client() -> None:
        while True:
            raw = await websocket.receive_json()
            if not isinstance(raw, dict) or raw.get("type") != "PROFILE":
                continue
            updated = _profile_from_payload(
                raw.get("height_cm"),
                raw.get("age"),
                raw.get("sex"),
                expected_weight_kg=raw.get("expected_weight_kg"),
                people_type=raw.get("people_type"),
                birth_date=raw.get("birth_date"),
                display_name=raw.get("display_name") or raw.get("name"),
            )
            profile_box[0] = updated
            pid = _as_uuid(raw.get("person_id"))
            if pid is not None:
                person_id_box[0] = pid
            if updated is None:
                await send_status("Perfil inválido — preencha altura, nascimento/idade e sexo.")
                continue
            if raw.get("apply"):
                profile_sync_box[0] = int(profile_sync_box[0]) + 1
            weight = updated.expected_weight_kg
            if weight is None:
                await send_status(
                    f"Perfil na Cabine: {updated.height_cm:.0f} cm, {updated.age} anos, "
                    f"{updated.sex}, tipo={updated.people_type}."
                )
            else:
                await send_status(
                    f"Perfil na Cabine: {updated.height_cm:.0f} cm, {updated.age} anos, "
                    f"{updated.sex}, tipo={updated.people_type}, peso esperado={weight:.1f} kg."
                )

    try:
        await send_status(f"Iniciando {adapter.label}...")
        profile = profile_box[0]
        if profile is None:
            await send_status(
                "Sem perfil: informe altura, nascimento/idade, sexo e peso esperado."
            )
        else:
            await send_status(
                f"Perfil ativo: {profile.height_cm:.0f} cm, {profile.age} anos, {profile.sex}, "
                f"tipo={profile.people_type}."
            )
        client_task = asyncio.create_task(listen_client())
        try:
            await adapter.run(
                websocket=websocket,
                spec=spec,
                parse=parse,
                dispatch=dispatch,
                send_status=send_status,
                queue=queue,
                profile=profile,
                profile_box=profile_box,
                profile_sync_box=profile_sync_box,
            )
        finally:
            client_task.cancel()
            try:
                await client_task
            except asyncio.CancelledError:
                pass
    except WebSocketDisconnect:
        logger.info("Frontend desconectou da sessão WebSocket da balança.")
    except Exception:
        logger.exception("Erro no adapter de balança")
        try:
            await send_status("Falha na comunicação com a balança.")
        except Exception:
            pass
