import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from './keys';
import { clearVisitDrafts } from './cabineSession';

const SKEW_MS = 10_000;

export type AccessTokenTyp = 'person' | 'user';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split('.')[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const parsed: unknown = JSON.parse(atob(normalized));
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

function decodeJwtExpMs(token: string): number | null {
    const exp = decodeJwtPayload(token)?.exp;
    return typeof exp === 'number' ? exp * 1000 : null;
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
    const expiresAt = decodeJwtExpMs(token) ?? storedExpiryMs();
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

export function getAccessTokenTyp(): AccessTokenTyp | null {
    const token = getAccessToken();
    if (!token || !isAccessSessionValid()) return null;
    const typ = decodeJwtPayload(token)?.typ;
    return typ === 'person' || typ === 'user' ? typ : null;
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
