"""Workaround WinRT: get_descriptors_async pode lançar PermissionError/OSError.

No Windows, alguns firmwares (Yolanda/QN) quebram a enumeração de descritores.
O Bleak abortava a conexão inteira. Para start_notify isso não é necessário —
o CCCD é escrito pela API WinRT na characteristic.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from collections.abc import Sequence
from typing import Any, Optional

logger = logging.getLogger(__name__)

_PATCHED = False


def apply_winrt_descriptor_tolerance() -> None:
    global _PATCHED
    if _PATCHED or sys.platform != "win32":
        return

    from bleak.assigned_numbers import gatt_char_props_to_strs
    from bleak.backends.characteristic import BleakGATTCharacteristic
    from bleak.backends.descriptor import BleakGATTDescriptor
    from bleak.backends.service import BleakGATTService, BleakGATTServiceCollection
    from bleak.backends.winrt import client as winrt_client
    from winrt.windows.devices.bluetooth import BluetoothCacheMode
    from winrt.windows.devices.bluetooth.genericattributeprofile import (
        GattCharacteristic,
        GattCommunicationStatus,
        GattDescriptor,
        GattDeviceService,
    )

    FutureLike = winrt_client.FutureLike
    _ensure_success = winrt_client._ensure_success

    async def _get_services_tolerant(self, *,
        service_cache_mode: Optional[BluetoothCacheMode] = None,
        cache_mode: Optional[BluetoothCacheMode] = None,
        **kwargs: Any,
    ) -> BleakGATTServiceCollection:
        if self.services is not None:
            return self.services

        new_services = BleakGATTServiceCollection()
        services: Sequence[GattDeviceService]
        retries = 10
        assert self._requester

        if self._requested_services is None:
            while True:
                if service_cache_mode is not None:
                    result = await FutureLike(
                        self._requester.get_gatt_services_with_cache_mode_async(
                            service_cache_mode
                        )
                    )
                else:
                    result = await FutureLike(self._requester.get_gatt_services_async())

                if result.status == GattCommunicationStatus.UNREACHABLE:
                    if retries > 0:
                        retries -= 1
                        await asyncio.sleep(1)
                        continue

                services = _ensure_success(
                    result,
                    "services",
                    "Could not get GATT services",
                )
                break
        else:
            services = []
            for service_uuid in self._requested_services:
                while True:
                    if service_cache_mode is not None:
                        result = await FutureLike(
                            self._requester.get_gatt_services_for_uuid_with_cache_mode_async(
                                service_uuid, service_cache_mode
                            )
                        )
                    else:
                        result = await FutureLike(
                            self._requester.get_gatt_services_for_uuid_async(service_uuid)
                        )

                    if result.status == GattCommunicationStatus.UNREACHABLE:
                        if retries > 0:
                            retries -= 1
                            await asyncio.sleep(1)
                            continue

                    services.extend(
                        _ensure_success(
                            result,
                            "services",
                            "Could not get GATT services",
                        )
                    )
                    break

        try:
            for service in services:
                if cache_mode is not None:
                    result = await FutureLike(
                        service.get_characteristics_with_cache_mode_async(cache_mode)
                    )
                else:
                    result = await FutureLike(service.get_characteristics_async())

                if result.status == GattCommunicationStatus.ACCESS_DENIED:
                    logger.debug("skipping service %s due to access denied", service.uuid)
                    continue

                characteristics: Sequence[GattCharacteristic] = _ensure_success(
                    result,
                    "characteristics",
                    f"Could not get GATT characteristics for service {service.uuid} ({service.attribute_handle})",
                )

                serv = BleakGATTService(service, service.attribute_handle, str(service.uuid))
                new_services.add_service(serv)

                for characteristic in characteristics:
                    descriptors: Sequence[GattDescriptor] = []
                    try:
                        if cache_mode is not None:
                            desc_result = await FutureLike(
                                characteristic.get_descriptors_with_cache_mode_async(
                                    cache_mode
                                )
                            )
                        else:
                            desc_result = await FutureLike(
                                characteristic.get_descriptors_async()
                            )

                        if desc_result.status == GattCommunicationStatus.ACCESS_DENIED:
                            logger.debug(
                                "skipping descriptors for %s due to access denied",
                                characteristic.uuid,
                            )
                        else:
                            descriptors = _ensure_success(
                                desc_result,
                                "descriptors",
                                f"Could not get GATT descriptors for characteristic {characteristic.uuid} ({characteristic.attribute_handle})",
                            )
                    except (PermissionError, OSError) as exc:
                        logger.warning(
                            "Ignorando falha WinRT em descritores de %s: %s",
                            characteristic.uuid,
                            exc,
                        )

                    char = BleakGATTCharacteristic(
                        characteristic,
                        characteristic.attribute_handle,
                        str(characteristic.uuid),
                        list(
                            gatt_char_props_to_strs(
                                characteristic.characteristic_properties
                            )
                        ),
                        lambda: self.mtu_size - 3,
                        serv,
                    )
                    new_services.add_characteristic(char)

                    for descriptor in descriptors:
                        new_services.add_descriptor(
                            BleakGATTDescriptor(
                                descriptor,
                                descriptor.attribute_handle,
                                str(descriptor.uuid),
                                char,
                            )
                        )

            return new_services
        except BaseException:
            logger.debug("disposing service objects after GATT discovery failure")
            await asyncio.sleep(0.1)
            for service in services:
                service.close()
            raise

    winrt_client.BleakClientWinRT._get_services = _get_services_tolerant  # type: ignore[method-assign]
    _PATCHED = True
    logger.info("Patch WinRT aplicado: falhas em descritores GATT serão ignoradas.")
