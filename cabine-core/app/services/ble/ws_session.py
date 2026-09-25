from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine
from typing import Any
from uuid import UUID

from starlette.websockets import WebSocket, WebSocketState

from app.services.ble.ids import parse_uuid

logger = logging.getLogger(__name__)


class DeviceWsSession:
    """State every device WebSocket shares: who is measuring, status messages, background saves.

    A person-token session is `person_locked`: the client cannot switch patient mid-stream.
    """

    def __init__(
        self,
        websocket: WebSocket,
        *,
        person_id: UUID | None,
        visit_id: UUID | None,
        person_locked: bool,
    ) -> None:
        self.websocket = websocket
        self.person_id = person_id
        self.visit_id = visit_id
        self.person_locked = person_locked
        self._tasks: set[asyncio.Task] = set()

    def cancelled(self) -> bool:
        return self.websocket.client_state != WebSocketState.CONNECTED

    async def send_json(self, payload: dict) -> bool:
        if self.cancelled():
            return False
        try:
            await self.websocket.send_json(payload)
            return True
        except Exception:
            return False

    async def send_status(self, msg: str) -> None:
        await self.send_json({"type": "STATUS", "msg": msg})

    def apply_ids(self, raw: dict) -> None:
        if not self.person_locked:
            pid = parse_uuid(raw.get("person_id"))
            if pid is not None:
                self.person_id = pid
        vid = parse_uuid(raw.get("visit_id"))
        if vid is not None:
            self.visit_id = vid

    async def listen_person_messages(self) -> None:
        """Consume `{"type": "PERSON", ...}` messages until the socket closes."""
        try:
            while not self.cancelled():
                raw = await self.websocket.receive_json()
                if isinstance(raw, dict) and raw.get("type") == "PERSON":
                    self.apply_ids(raw)
        except Exception:
            return

    def spawn(self, coro: Coroutine[Any, Any, Any]) -> asyncio.Task:
        """Run a background job (e.g. persistence) that is awaited when the session closes."""
        task = asyncio.create_task(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    async def drain(self) -> None:
        if self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)


async def cancel_and_wait(*tasks: asyncio.Task | None) -> None:
    for task in tasks:
        if task is not None and not task.done():
            task.cancel()
    for task in tasks:
        if task is None:
            continue
        try:
            await task
        except asyncio.CancelledError:
            pass


async def consume_queue(websocket: WebSocket, queue: Any, *, poll_seconds: float = 0.4) -> None:
    """Forward queued payloads to the client until it disconnects or a send fails."""
    while websocket.client_state == WebSocketState.CONNECTED:
        try:
            data = await asyncio.wait_for(queue.get(), timeout=poll_seconds)
        except TimeoutError:
            continue
        try:
            await websocket.send_json(data)
        except Exception:
            logger.debug("Falha ao enviar dados do dispositivo para a tela.", exc_info=True)
            return
