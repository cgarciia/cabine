import { STORAGE_KEYS } from './keys';

export function loadOximeterAddress(): string {
    return localStorage.getItem(STORAGE_KEYS.oximeterAddress) || '';
}

export function saveOximeterAddress(address: string) {
    const mac = address.trim().toUpperCase();
    if (mac) localStorage.setItem(STORAGE_KEYS.oximeterAddress, mac);
}
