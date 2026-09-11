import { loadCurrentPersonId } from './currentPerson';

export type HealthAnswers = Record<string, string | string[]>;

export type MentalInstrumentId = 'HAD' | 'AUDIT' | 'WHO-5';

export interface MentalResult {
    instrument: MentalInstrumentId;
    score: number;
    hadA?: number;
    hadD?: number;
    band: string;
    tone: 'ok' | 'watch' | 'alert';
}

export interface MentalItemLog {
    id: string;
    text: string;
    label: string;
    score: number;
}

export interface MentalInstrumentLog {
    instrument: MentalInstrumentId;
    items: MentalItemLog[];
}

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

function sessionKey(personId?: string) {
    const id = personId || loadCurrentPersonId();
    return id ? `cabine.session.${id}` : 'cabine.session.anon';
}

function emptySession(): CabineSession {
    return { personId: loadCurrentPersonId() || undefined };
}

export function loadSession(personId?: string): CabineSession {
    try {
        const raw = localStorage.getItem(sessionKey(personId));
        if (!raw) return emptySession();
        return JSON.parse(raw) as CabineSession;
    } catch {
        return emptySession();
    }
}

export function saveSession(session: CabineSession) {
    localStorage.setItem(sessionKey(session.personId), JSON.stringify(session));
}

export function patchSession(patch: Partial<CabineSession>): CabineSession {
    const personId = patch.personId || loadCurrentPersonId();
    const next = { ...loadSession(personId), ...patch, personId };
    saveSession(next);
    return next;
}

export function resetSession(personId?: string) {
    localStorage.removeItem(sessionKey(personId));
}
