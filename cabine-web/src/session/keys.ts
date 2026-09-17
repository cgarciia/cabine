/** Chaves `cabine.*`. Não usar prefixos soltos (`token`, `cabine-kiosk-session`). */

export const STORAGE_KEYS = {
    token: 'cabine.token',
    tokenExpiresAt: 'cabine.token-expires-at',
    currentPersonId: 'cabine.current-person-id',
    oximeterAddress: 'cabine.oximeter-address',
    role: 'cabine.role',
    kioskSession: 'cabine.kiosk-session',
} as const;

export function cabineSessionKey(personId?: string) {
    return personId ? `cabine.session.${personId}` : 'cabine.session.anon';
}

/** Chaves antigas; só leitura/migração. */
export const LEGACY_STORAGE_KEYS = {
    token: 'token',
    personId: 'cabine-person-id',
    kioskSession: 'cabine-kiosk-session',
} as const;
