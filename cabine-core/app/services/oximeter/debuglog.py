from __future__ import annotations

import logging
import threading
from datetime import datetime
from pathlib import Path

LOG_PATH = Path(__file__).resolve().parents[3] / "oximeter_debug.log"
_lock = threading.Lock()
_logger: logging.Logger | None = None


def log_path() -> Path:
    return LOG_PATH


def get_debug_logger() -> logging.Logger:
    global _logger
    if _logger is not None:
        return _logger
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("cabine.oximeter.debug")
    logger.setLevel(logging.DEBUG)
    logger.propagate = False
    if not logger.handlers:
        handler = logging.FileHandler(LOG_PATH, encoding="utf-8")
        handler.setLevel(logging.DEBUG)
        handler.setFormatter(logging.Formatter("%(asctime)s.%(msecs)03d %(message)s", "%H:%M:%S"))
        logger.addHandler(handler)
        stream = logging.StreamHandler()
        stream.setLevel(logging.DEBUG)
        stream.setFormatter(logging.Formatter("[oximetro] %(asctime)s %(message)s", "%H:%M:%S"))
        logger.addHandler(stream)
    _logger = logger
    return logger


def dbg(message: str, *args) -> None:
    get_debug_logger().info(message, *args)
    with _lock:
        # FileHandler already writes; flush so o relatório não some se o processo cair.
        for handler in get_debug_logger().handlers:
            try:
                handler.flush()
            except Exception:
                pass


def session_banner(reason: str) -> None:
    dbg("=" * 72)
    dbg("SESSAO %s  %s", reason, datetime.now().isoformat(timespec="seconds"))
    dbg("arquivo=%s", LOG_PATH)
    dbg("=" * 72)


def tail_text(max_chars: int = 80_000) -> str:
    if not LOG_PATH.exists():
        return "(ainda não há oximeter_debug.log — abra a tela de oximetria e tente de novo)"
    data = LOG_PATH.read_text(encoding="utf-8", errors="replace")
    if len(data) <= max_chars:
        return data
    return data[-max_chars:]
