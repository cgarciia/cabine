"""Identidade deste PC, fora da pasta do programa."""

import json
import sys
from pathlib import Path
from uuid import UUID, uuid4

from app.core.config import cabin_state_file


def state_path() -> Path:
    return cabin_state_file()


def read_state() -> dict:
    path = state_path()
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def write_state(payload: dict) -> None:
    path = state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def cabin_id() -> UUID | None:
    raw = read_state().get("cabin_id")
    if not raw:
        return None
    try:
        return UUID(str(raw))
    except ValueError:
        return None


def windows_machine_guid() -> str | None:
    if sys.platform != "win32":
        return None
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as key:
            value, _kind = winreg.QueryValueEx(key, "MachineGuid")
    except OSError:
        return None
    text = str(value).strip()
    return text or None


def ensure_machine_id() -> str:
    """Guid do Windows. Sem ele, um UUID gravado uma vez neste PC."""
    guid = windows_machine_guid()
    if guid:
        return guid
    state = read_state()
    stored = str(state.get("machine_id") or "").strip()
    if stored:
        return stored
    generated = str(uuid4())
    state["machine_id"] = generated
    write_state(state)
    return generated


def remember_cabin(cabin: UUID, machine: str) -> None:
    state = read_state()
    state["machine_id"] = machine
    state["cabin_id"] = str(cabin)
    write_state(state)
