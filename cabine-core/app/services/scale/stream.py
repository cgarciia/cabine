import asyncio
import logging
from datetime import datetime
from uuid import UUID

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import scale as scale_crud
from app.services.scale.registry import get_adapter, resolve_parser

logger = logging.getLogger(__name__)


async def stream_scale(
    websocket: WebSocket,
    db: AsyncSession,
    scale_id: UUID | None = None,
) -> None:
    await websocket.accept()

    if scale_id is not None:
        record = await scale_crud.get_by_id(db, scale_id)
    else:
        record = await scale_crud.get_default(db)

    if record is None:
        await websocket.send_json(
            {"type": "STATUS", "msg": "Nenhuma balança cadastrada. Cadastre uma na tela de balanças."}
        )
        await websocket.close()
        return

    if not record.is_active:
        await websocket.send_json(
            {"type": "STATUS", "msg": f"A balança '{record.name}' está inativa."}
        )
        await websocket.close()
        return

    spec = scale_crud.to_spec(record)

    try:
        adapter = get_adapter(spec.adapter)
        parse = resolve_parser(spec)
    except ValueError as exc:
        await websocket.send_json({"type": "STATUS", "msg": str(exc)})
        await websocket.close()
        return

    queue: asyncio.Queue[dict] = asyncio.Queue()
    last_weight: float | None = None

    def dispatch(peso_kg: float | None) -> None:
        nonlocal last_weight
        if peso_kg is None or peso_kg == last_weight:
            return
        last_weight = peso_kg
        queue.put_nowait(
            {
                "type": "PESO_RECEBIDO",
                "scale_id": str(spec.id),
                "adapter": spec.adapter,
                "balanca_nome": spec.name,
                "peso_kg": peso_kg,
                "timestamp": datetime.now().strftime("%H:%M:%S"),
            }
        )

    async def send_status(msg: str) -> None:
        await websocket.send_json({"type": "STATUS", "msg": msg})

    try:
        await send_status(f"Iniciando {adapter.label}...")
        await adapter.run(
            websocket=websocket,
            spec=spec,
            parse=parse,
            dispatch=dispatch,
            send_status=send_status,
            queue=queue,
        )
    except WebSocketDisconnect:
        logger.info("Frontend desconectou da sessão WebSocket da balança.")
    except Exception:
        logger.exception("Erro no adapter de balança")
        try:
            await send_status("Falha na comunicação com a balança.")
        except Exception:
            pass
