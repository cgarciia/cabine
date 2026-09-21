import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from 'react';
import type { ReactNode } from 'react';

import type { QuestionnaireScore } from '../modules/health/questionnaires';
import { clearCurrentPersonId, saveCurrentPersonId } from '../session/currentPerson';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '../session/keys';
import { newVisitId } from '../session/visitId';
import type { BloodPressureReading } from '../types/bloodPressure';
import type { MeasurementRecord } from '../types/measurement';
import type { MentalInstrumentId, MentalInstrumentLog, MentalResult } from '../types/mental';
import type { OximeterReading } from '../types/oximeter';
import type { ScalePerson } from '../types/person';

export type MentalKioskSession = {
    accepted: boolean;
    refused?: boolean;
    gate: number[];
    results: MentalResult[];
    safetyTriggered?: boolean;
    completedAt?: string;
    instrument?: MentalInstrumentId;
    instrumentLog?: MentalInstrumentLog[];
};

export type KioskSession = {
    visitId: string | null;
    person: ScalePerson | null;
    generalHealth: QuestionnaireScore | null;
    mentalHealth: MentalKioskSession | null;
    lastMeasurement: MeasurementRecord | null;
    lastOximeter: OximeterReading | null;
    lastBloodPressure: BloodPressureReading | null;
};

type KioskContextValue = {
    session: KioskSession;
    setPerson: (person: ScalePerson | null) => void;
    beginVisit: (person: ScalePerson) => void;
    setGeneralHealth: (score: QuestionnaireScore | null) => void;
    setMentalHealth: (score: MentalKioskSession | null) => void;
    setLastMeasurement: (record: MeasurementRecord | null) => void;
    setLastOximeter: (reading: OximeterReading | null) => void;
    setLastBloodPressure: (reading: BloodPressureReading | null) => void;
    clearSession: () => void;
    hasReportData: boolean;
};

const empty: KioskSession = {
    visitId: null,
    person: null,
    generalHealth: null,
    mentalHealth: null,
    lastMeasurement: null,
    lastOximeter: null,
    lastBloodPressure: null,
};

function loadSession(): KioskSession {
    try {
        const raw =
            sessionStorage.getItem(STORAGE_KEYS.kioskSession)
            || sessionStorage.getItem(LEGACY_STORAGE_KEYS.kioskSession);
        if (!raw) return empty;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const next: KioskSession = {
            ...empty,
            ...parsed,
            generalHealth: (parsed.generalHealth ?? parsed.saudeGeral ?? null) as QuestionnaireScore | null,
            mentalHealth: (parsed.mentalHealth ?? parsed.saudeMental ?? null) as MentalKioskSession | null,
        };
        if (next.person && !next.visitId) next.visitId = newVisitId();
        sessionStorage.setItem(STORAGE_KEYS.kioskSession, JSON.stringify(next));
        sessionStorage.removeItem(LEGACY_STORAGE_KEYS.kioskSession);
        return next;
    } catch {
        return empty;
    }
}

function persist(session: KioskSession) {
    try {
        sessionStorage.setItem(STORAGE_KEYS.kioskSession, JSON.stringify(session));
        sessionStorage.removeItem(LEGACY_STORAGE_KEYS.kioskSession);
    } catch {
        /* quota / private mode */
    }
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
        setSession((prev) => {
            const samePerson = Boolean(person && prev.person && prev.person.id === person.id);
            const visitId = person
                ? (samePerson && prev.visitId ? prev.visitId : newVisitId())
                : null;
            const next: KioskSession = samePerson
                ? { ...prev, person, visitId }
                : { ...empty, person, visitId };
            persist(next);
            return next;
        });
        if (person) saveCurrentPersonId(person.id);
        else clearCurrentPersonId();
    }, []);

    const beginVisit = useCallback((person: ScalePerson) => {
        const next: KioskSession = { ...empty, person, visitId: newVisitId() };
        persist(next);
        setSession(next);
        saveCurrentPersonId(person.id);
    }, []);

    const clearSession = useCallback(() => {
        setSession(empty);
        sessionStorage.removeItem(STORAGE_KEYS.kioskSession);
        sessionStorage.removeItem(LEGACY_STORAGE_KEYS.kioskSession);
        clearCurrentPersonId();
    }, []);

    const mentalDone = Boolean(
        session.mentalHealth?.completedAt || session.mentalHealth?.refused,
    );

    const value = useMemo<KioskContextValue>(() => ({
        session,
        setPerson,
        beginVisit,
        setGeneralHealth: (generalHealth) => update({ generalHealth }),
        setMentalHealth: (mentalHealth) => update({ mentalHealth }),
        setLastMeasurement: (lastMeasurement) => update({ lastMeasurement }),
        setLastOximeter: (lastOximeter) => update({ lastOximeter }),
        setLastBloodPressure: (lastBloodPressure) => update({ lastBloodPressure }),
        clearSession,
        hasReportData: Boolean(
            session.generalHealth
            || session.lastMeasurement
            || session.lastOximeter
            || session.lastBloodPressure
            || mentalDone,
        ),
    }), [session, setPerson, beginVisit, update, clearSession, mentalDone]);

    return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
}

export function useKiosk() {
    const ctx = useContext(KioskContext);
    if (!ctx) throw new Error('useKiosk must be used inside KioskProvider');
    return ctx;
}
