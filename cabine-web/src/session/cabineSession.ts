import type {
    MentalInstrumentId,
    MentalInstrumentLog,
    MentalResult,
} from '../types/mental';
import { loadCurrentPersonId } from './currentPerson';
import { cabineSessionKey } from './keys';

export type HealthAnswers = Record<string, string | string[]>;

export interface CabineSession {
    personId?: string;
    health?: {
        completedAt: string;
        answers: HealthAnswers;
    };
    mental?: {
        invitedAt?: string;
        accepted?: boolean;
        refusedAt?: string;
        gate?: number[];
        instrument?: MentalInstrumentId;
        optionalOffered?: MentalInstrumentId;
        optionalAccepted?: boolean;
        instrumentLog?: MentalInstrumentLog[];
        results: MentalResult[];
        safetyTriggered?: boolean;
        completedAt?: string;
        startedAt?: string;
    };
}

function emptySession(): CabineSession {
    return { personId: loadCurrentPersonId() || undefined };
}

export function loadSession(personId?: string): CabineSession {
    try {
        const raw = localStorage.getItem(cabineSessionKey(personId || loadCurrentPersonId()));
        if (!raw) return emptySession();
        return JSON.parse(raw) as CabineSession;
    } catch {
        return emptySession();
    }
}

export function saveSession(session: CabineSession) {
    localStorage.setItem(cabineSessionKey(session.personId), JSON.stringify(session));
}

export function patchSession(patch: Partial<CabineSession>): CabineSession {
    const personId = patch.personId || loadCurrentPersonId();
    const next = { ...loadSession(personId), ...patch, personId };
    saveSession(next);
    return next;
}

export function resetSession(personId?: string) {
    localStorage.removeItem(cabineSessionKey(personId || loadCurrentPersonId()));
}

export function clearVisitDrafts() {
    const prefix = 'cabine.session.';
    const stale: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && key.startsWith(prefix)) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
}
