import { STORAGE_KEYS } from '../session/keys';

export type CabineRole = 'patient' | 'clinician';

export function loadRole(): CabineRole | null {
    const value = localStorage.getItem(STORAGE_KEYS.role);
    if (value === 'patient' || value === 'clinician') return value;
    return null;
}

export function saveRole(role: CabineRole) {
    localStorage.setItem(STORAGE_KEYS.role, role);
}

export function clearRole() {
    localStorage.removeItem(STORAGE_KEYS.role);
}
