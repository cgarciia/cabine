/** `cabine.*` keys. Do not use loose prefixes (`token`, `cabine-kiosk-session`). */

export const STORAGE_KEYS = {
    token: 'cabine.token',
    tokenExpiresAt: 'cabine.token-expires-at',
    currentPersonId: 'cabine.current-person-id',
    oximeterAddress: 'cabine.oximeter-address',
    bpAddress: 'cabine.bp-address',
    bpWristAddress: 'cabine.bp-wrist-address',
    kioskSession: 'cabine.kiosk-session',
} as const;

export const SESSION_KEY_PREFIX = 'cabine.session.';

export function cabineSessionKey(personId?: string) {
    return personId ? `${SESSION_KEY_PREFIX}${personId}` : `${SESSION_KEY_PREFIX}anon`;
}

/** Legacy keys; read/migrate only. */
export const LEGACY_STORAGE_KEYS = {
    token: 'token',
    personId: 'cabine-person-id',
    kioskSession: 'cabine-kiosk-session',
} as const;
