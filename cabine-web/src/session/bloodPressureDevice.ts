import { STORAGE_KEYS } from './keys';

export function loadBloodPressureAddress(): string {
    return localStorage.getItem(STORAGE_KEYS.bpAddress) || '';
}

export function saveBloodPressureAddress(address: string) {
    const mac = address.trim().toUpperCase();
    if (mac) localStorage.setItem(STORAGE_KEYS.bpAddress, mac);
}
