import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from './keys';

export function loadCurrentPersonId(): string {
    return (
        localStorage.getItem(STORAGE_KEYS.currentPersonId)
        || sessionStorage.getItem(LEGACY_STORAGE_KEYS.personId)
        || ''
    );
}

export function saveCurrentPersonId(id: string) {
    localStorage.setItem(STORAGE_KEYS.currentPersonId, id);
    sessionStorage.removeItem(LEGACY_STORAGE_KEYS.personId);
}

export function clearCurrentPersonId() {
    localStorage.removeItem(STORAGE_KEYS.currentPersonId);
    sessionStorage.removeItem(LEGACY_STORAGE_KEYS.personId);
}
