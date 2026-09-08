from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import WebSocket

from app.services.scale.parsers import ParserFn
from app.services.scale.spec import ScaleSpec

DispatchFn = Callable[[float | None], None]
StatusFn = Callable[[str], Awaitable[None]]


class ScaleAdapter(ABC):
    key: str
    label: str
    address_kind: str
    address_label: str
    parsers: tuple[str, ...]

    def normalize_address(self, address: str) -> str:
        return address.strip()

    def validate_address(self, address: str) -> str:
        normalized = self.normalize_address(address)
        if not normalized:
            raise ValueError("Endereço é obrigatório.")
        return normalized

    @abstractmethod
    async def run(
        self,
        websocket: WebSocket,
        spec: ScaleSpec,
        parse: ParserFn,
        dispatch: DispatchFn,
        send_status: StatusFn,
        queue: Any,
    ) -> None:
        """Lê o hardware e empilha leituras até o WebSocket encerrar."""
