from app.services.ble.common import ble_radio_lock, normalize_mac, watch_websocket_closed
from app.services.ble.ids import parse_uuid
from app.services.ble.winrt_patch import apply_winrt_descriptor_tolerance

# Every peripheral module imports this package, so the WinRT patch is applied once here.
apply_winrt_descriptor_tolerance()

__all__ = [
    "ble_radio_lock",
    "normalize_mac",
    "parse_uuid",
    "watch_websocket_closed",
]
