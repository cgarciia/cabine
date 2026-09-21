import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from './keys';
import { clearVisitDrafts } from './cabineSession';

const SKEW_MS = 10_000;

function decodeJwtExpMs(token: string): number | null {
    try {
        const payload = token.split('.')[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const parsed = JSON.parse(atob(normalized)) as { exp?: unknown };
        if (typeof parsed.exp !== 'number') return null;
        return parsed.exp * 1000;
    } catch {
        return null;
    }
}

function storedExpiryMs(): number | null {
    const raw = localStorage.getItem(STORAGE_KEYS.tokenExpiresAt);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

export function getAccessToken(): string {
    return localStorage.getItem(STORAGE_KEYS.token) || localStorage.getItem(LEGACY_STORAGE_KEYS.token) || '';
}

export function isAccessSessionValid(): boolean {
    const token = getAccessToken();
    if (!token) return false;
    const jwtExp = decodeJwtExpMs(token);
    const storedExp = storedExpiryMs();
    const expiresAt = jwtExp ?? storedExp;
    if (expiresAt == null) return false;
    return Date.now() + SKEW_MS < expiresAt;
}

export function saveAccessSession(token: string, expiresInSeconds: number): void {
    const jwtExp = decodeJwtExpMs(token);
    const fromApi = Date.now() + Math.max(1, expiresInSeconds) * 1000;
    const expiresAt = jwtExp != null ? Math.min(jwtExp, fromApi) : fromApi;
    localStorage.setItem(STORAGE_KEYS.token, token);
    localStorage.setItem(STORAGE_KEYS.tokenExpiresAt, String(expiresAt));
    localStorage.removeItem(LEGACY_STORAGE_KEYS.token);
}

export function getAccessTokenTyp(): 'person' | 'user' | null {
    const token = getAccessToken();
    if (!token || !isAccessSessionValid()) return null;
    try {
        const payload = token.split('.')[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const parsed = JSON.parse(atob(normalized)) as { typ?: unknown; sub?: unknown };
        if (parsed.typ === 'person' || parsed.typ === 'user') return parsed.typ;
        if (typeof parsed.sub === 'string' && parsed.sub.includes('@')) return 'user';
        return 'person';
    } catch {
        return null;
    }
}

export function clearAccessSession(): void {
    clearVisitDrafts();
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.tokenExpiresAt);
    localStorage.removeItem(LEGACY_STORAGE_KEYS.token);
    sessionStorage.removeItem(STORAGE_KEYS.kioskSession);
    sessionStorage.removeItem(LEGACY_STORAGE_KEYS.kioskSession);
    localStorage.removeItem(STORAGE_KEYS.currentPersonId);
    sessionStorage.removeItem(LEGACY_STORAGE_KEYS.personId);
}
