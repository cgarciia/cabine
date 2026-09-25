from __future__ import annotations

import asyncio
import logging
import sys
from collections.abc import Callable

from bleak import BleakClient, BleakError
from bleak.backends.device import BLEDevice

from app.services.ble.scanner import service_count

logger = logging.getLogger(__name__)


def default_connect_attempts() -> list[dict]:
    """WinRT's service cache sometimes returns an empty GATT table; retry without it."""
    if sys.platform == "win32":
        return [
            {"winrt": {"use_cached_services": True}},
            {"winrt": {"use_cached_services": False}},
            {},
        ]
    return [{}]


async def connect_with_fallback(
    device: BLEDevice | str,
    *,
    label: str,
    timeout: float,
    attempts: list[dict] | None = None,
    pair: bool = False,
    require_services: Callable[[dict], bool] = lambda _kwargs: True,
    retry_delay: float = 0.0,
) -> BleakClient:
    """Try each BleakClient option set in order and return the first usable connection."""
    errors: list[str] = []
    for kwargs in attempts if attempts is not None else default_connect_attempts():
        client = BleakClient(device, timeout=timeout, **kwargs)
        try:
            await client.connect()
            if require_services(kwargs) and service_count(client) == 0:
                raise BleakError("Nenhum serviço GATT encontrado.")
            if pair:
                try:
                    await client.pair()
                except Exception:
                    logger.debug("%s: pair() dispensado (vínculo já existe).", label, exc_info=True)
            logger.info("%s conectado com opções %s", label, kwargs or "default")
            return client
        except Exception as exc:
            errors.append(f"{kwargs or 'default'}: {exc}")
            logger.warning("Tentativa GATT %s falhou (%s): %s", label, kwargs or "default", exc)
            try:
                await client.disconnect()
            except Exception:
                pass
            if retry_delay:
                await asyncio.sleep(retry_delay)
    raise BleakError(
        f"Não foi possível conectar ao {label}. " + (errors[-1] if errors else "erro desconhecido")
    )
