import asyncio
import logging
from datetime import datetime
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect

from app.core.database import AsyncSessionLocal
from app.crud import scale as scale_crud
from app.services.ble.ids import parse_uuid
from app.services.scale.rm_rd2504a import has_bia_impedances
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
    visit_id: UUID | None = None,
    *,
    person_locked: bool = False,
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
    visit_id_box: list[UUID | None] = [visit_id]
    last_reading_box: list[dict | None] = [None]
    saved_keys: set[tuple] = set()

    def schedule_save(item: dict) -> None:
        pid = person_id_box[0]
        if pid is None:
            logger.warning("Medição não salva: nenhuma pessoa na sessão")
            return
        try:
            peso = round(float(item.get("weight_kg") or 0), 2)
        except (TypeError, ValueError):
            return
        if peso < 10:
            return
        key = (str(pid), peso, bool(item.get("complete")))
        if key in saved_keys:
            return
        saved_keys.add(key)

        async def _run() -> None:
            try:
                await save_from_scale_event(
                    person_id=pid,
                    scale_id=spec.id,
                    payload=item,
                    visit_id=visit_id_box[0],
                )
            except Exception:
                saved_keys.discard(key)
                logger.exception("Falha ao salvar medição no banco")

        asyncio.create_task(_run())

    class SaveQueue:
        def __init__(self, inner: asyncio.Queue):
            self._inner = inner

        def put_nowait(self, item: dict) -> None:
            if isinstance(item, dict):
                if item.get("type") == "WEIGHT":
                    last_reading_box[0] = item
                    if item.get("complete") or has_bia_impedances(item.get("impedances_ohm") or []):
                        schedule_save(item)
                elif item.get("type") == "STEP" and item.get("reset") and last_reading_box[0]:
                    last_item = last_reading_box[0]
                    if last_item.get("complete") or has_bia_impedances(
                        last_item.get("impedances_ohm") or []
                    ):
                        schedule_save(last_item)
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
            reading = ScaleReading(weight_kg=float(reading))
        if reading.weight_kg <= 0:
            return

        signature = (
            round(reading.weight_kg, 2),
            reading.stable,
            reading.complete,
            tuple(reading.impedances_ohm),
        )
        if signature == last_signature:
            return
        last_signature = signature

        payload: dict = {
            "type": "WEIGHT",
            "scale_id": str(spec.id),
            "adapter": spec.adapter,
            "scale_name": spec.name,
            "supports_bia": adapter.supports_bia,
            "weight_kg": reading.weight_kg,
            "stable": reading.stable,
            "complete": reading.complete,
            "source": reading.source,
            "timestamp": datetime.now().strftime("%H:%M:%S"),
        }
        use_bia = adapter.supports_bia
        if use_bia and reading.impedances_ohm:
            payload["impedances_ohm"] = reading.impedances_ohm
        if use_bia and reading.segments:
            payload["segments"] = [
                {
                    "name": item.name,
                    "side": item.side,
                    "freq_khz": item.freq_khz,
                    "ohm": item.ohm,
                }
                for item in reading.segments
            ]
        if use_bia and has_bia_impedances(reading.impedances_ohm):
            payload["complete"] = True
        if reading.step:
            payload["step"] = reading.step
        profile = profile_box[0]
        if profile is not None:
            use_z = use_bia and (
                reading.complete or has_bia_impedances(reading.impedances_ohm)
            )
            payload["metrics"] = compute_report(
                reading.weight_kg,
                profile,
                impedancias_ohm=reading.impedances_ohm if use_z else None,
                segmentos=reading.segments if use_z else None,
            )
            payload["profile"] = {
                "height_cm": profile.height_cm,
                "age": profile.age,
                "sex": profile.sex,
                "expected_weight_kg": profile.expected_weight_kg,
                "people_type": profile.people_type,
                "birth_date": profile.birth_date.isoformat() if profile.birth_date else None,
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
            if not person_locked:
                pid = parse_uuid(raw.get("person_id"))
                if pid is not None:
                    person_id_box[0] = pid
            vid = parse_uuid(raw.get("visit_id"))
            if vid is not None:
                visit_id_box[0] = vid
            if updated is None:
                await send_status("Não foi possível confirmar seus dados. Volte ao cadastro.")
                continue
            if raw.get("apply"):
                profile_sync_box[0] = int(profile_sync_box[0]) + 1
            await send_status("Tudo certo. Pode subir na balança.")

    try:
        await send_status("Preparando a balança…")
        profile = profile_box[0]
        if profile is None:
            await send_status("Complete o cadastro antes de se pesar.")
        else:
            await send_status("Balança pronta. Pode subir.")
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
