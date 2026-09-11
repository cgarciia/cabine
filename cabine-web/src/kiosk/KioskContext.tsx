import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from 'react';
import type { ReactNode } from 'react';

import type { QuestionnaireScore } from '../data/questionnaires';
import type { MeasurementRecord } from '../types/measurement';
import type { ScalePerson } from '../types/person';

export type KioskSession = {
    person: ScalePerson | null;
    saudeGeral: QuestionnaireScore | null;
    saudeMental: QuestionnaireScore | null;
    lastMeasurement: MeasurementRecord | null;
};

type KioskContextValue = {
    session: KioskSession;
    setPerson: (person: ScalePerson | null) => void;
    setSaudeGeral: (score: QuestionnaireScore | null) => void;
    setSaudeMental: (score: QuestionnaireScore | null) => void;
    setLastMeasurement: (record: MeasurementRecord | null) => void;
    clearSession: () => void;
    hasReportData: boolean;
};

const empty: KioskSession = {
    person: null,
    saudeGeral: null,
    saudeMental: null,
    lastMeasurement: null,
};

const STORAGE_KEY = 'cabine-kiosk-session';

function loadSession(): KioskSession {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return empty;
        return { ...empty, ...JSON.parse(raw) } as KioskSession;
    } catch {
        return empty;
    }
}

function persist(session: KioskSession) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

const KioskContext = createContext<KioskContextValue | null>(null);

export function KioskProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<KioskSession>(() =>
        typeof window === 'undefined' ? empty : loadSession(),
    );

    const update = useCallback((patch: Partial<KioskSession>) => {
        setSession((prev) => {
            const next = { ...prev, ...patch };
            persist(next);
            return next;
        });
    }, []);

    const setPerson = useCallback((person: ScalePerson | null) => {
        update({ person });
        if (person) sessionStorage.setItem('cabine-person-id', person.id);
        else sessionStorage.removeItem('cabine-person-id');
    }, [update]);

    const clearSession = useCallback(() => {
        setSession(empty);
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem('cabine-person-id');
    }, []);

    const value = useMemo<KioskContextValue>(() => ({
        session,
        setPerson,
        setSaudeGeral: (saudeGeral) => update({ saudeGeral }),
        setSaudeMental: (saudeMental) => update({ saudeMental }),
        setLastMeasurement: (lastMeasurement) => update({ lastMeasurement }),
        clearSession,
        hasReportData: Boolean(session.saudeGeral || session.lastMeasurement),
    }), [session, setPerson, update, clearSession]);

    return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
}

export function useKiosk() {
    const ctx = useContext(KioskContext);
    if (!ctx) throw new Error('useKiosk deve ser usado dentro de KioskProvider');
    return ctx;
}
