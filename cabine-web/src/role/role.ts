const ROLE_KEY = 'cabine.role';

export type CabineRole = 'patient' | 'clinician';

export function loadRole(): CabineRole | null {
    const value = localStorage.getItem(ROLE_KEY);
    if (value === 'patient' || value === 'clinician') return value;
    return null;
}

export function saveRole(role: CabineRole) {
    localStorage.setItem(ROLE_KEY, role);
}

export function clearRole() {
    localStorage.removeItem(ROLE_KEY);
}
