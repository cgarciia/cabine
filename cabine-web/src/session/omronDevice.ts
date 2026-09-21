import { STORAGE_KEYS } from './keys';

const PAIRED_OMRON_ADDRESS = '00:5F:BF:08:0A:BF';

export function loadOmronAddress(): string {
    return localStorage.getItem(STORAGE_KEYS.omronAddress) || PAIRED_OMRON_ADDRESS;
}

export function saveOmronAddress(address: string) {
    const mac = address.trim().toUpperCase();
    if (mac) localStorage.setItem(STORAGE_KEYS.omronAddress, mac);
}
