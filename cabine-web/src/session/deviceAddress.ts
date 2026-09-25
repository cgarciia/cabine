import { STORAGE_KEYS } from './keys';

/** Last MAC each BLE device reported, so the next session connects straight to it. */
const ADDRESS_KEYS = {
    oximeter: STORAGE_KEYS.oximeterAddress,
    bloodPressure: STORAGE_KEYS.bpAddress,
} as const;

export type AddressedDevice = keyof typeof ADDRESS_KEYS;

export function loadDeviceAddress(device: AddressedDevice): string {
    return localStorage.getItem(ADDRESS_KEYS[device]) || '';
}

export function saveDeviceAddress(device: AddressedDevice, address: string) {
    const mac = address.trim().toUpperCase();
    if (mac) localStorage.setItem(ADDRESS_KEYS[device], mac);
}
