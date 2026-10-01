import { activeModules, type MvpModule } from '../config/mvp';
import { sameVisit } from '../session/visitScope';

export type KioskStepId =
    | 'generalHealth'
    | 'mentalHealth'
    | 'bia'
    | 'oximeter'
    | 'bloodPressure'
    | 'wristBloodPressure';

type VisitReading = { visit_id?: string | null } | null;

/** Kiosk session fields used to know which steps are already done. */
export type VisitProgressInput = {
    visitId?: string | null;
    generalHealth: unknown;
    mentalHealth: { completedAt?: string; refused?: boolean } | null;
    lastMeasurement: VisitReading;
    lastOximeter: VisitReading;
    lastBloodPressure: VisitReading;
    lastWristBloodPressure: VisitReading;
};

export type NextKioskStep = {
    id: KioskStepId;
    path: '/saude-geral' | '/saude-mental' | '/bioimpedancia' | '/oximetro' | '/pressao' | '/pressao-pulso';
    label: string;
};

/** Temperatura ainda não entra na visita: o menu mostra o lugar, sem etapa obrigatória. */
const STEPS_BY_MODULE: Record<MvpModule, NextKioskStep[]> = {
    questionario: [
        { id: 'generalHealth', path: '/saude-geral', label: 'Ir para saúde geral' },
        { id: 'mentalHealth', path: '/saude-mental', label: 'Ir para saúde mental' },
    ],
    bioimpedancia: [
        { id: 'bia', path: '/bioimpedancia', label: 'Ir para peso e bioimpedância' },
    ],
    oximetria: [
        { id: 'oximeter', path: '/oximetro', label: 'Ir para oxigenação' },
    ],
    pressao: [
        { id: 'bloodPressure', path: '/pressao', label: 'Ir para pressão com ECG' },
        { id: 'wristBloodPressure', path: '/pressao-pulso', label: 'Ir para pressão e pulso' },
    ],
    temperatura: [],
};

/** Etapas obrigatórias do cardápio desta porta, na ordem dos módulos. */
const STEPS: NextKioskStep[] = activeModules().flatMap((module) => STEPS_BY_MODULE[module]);

export function isMentalDone(session: VisitProgressInput): boolean {
    return Boolean(session.mentalHealth?.completedAt || session.mentalHealth?.refused);
}

function isStepDone(session: VisitProgressInput, id: KioskStepId, justFinished?: KioskStepId): boolean {
    if (justFinished === id) return true;
    if (id === 'generalHealth') return Boolean(session.generalHealth);
    if (id === 'mentalHealth') return isMentalDone(session);
    if (id === 'bia') return sameVisit(session.lastMeasurement, session.visitId);
    if (id === 'oximeter') return sameVisit(session.lastOximeter, session.visitId);
    if (id === 'bloodPressure') return sameVisit(session.lastBloodPressure, session.visitId);
    return sameVisit(session.lastWristBloodPressure, session.visitId);
}

export function isVisitComplete(session: VisitProgressInput, justFinished?: KioskStepId): boolean {
    return STEPS.every((step) => isStepDone(session, step.id, justFinished));
}

export function nextIncompleteStep(
    session: VisitProgressInput,
    justFinished?: KioskStepId,
): NextKioskStep | null {
    return STEPS.find((step) => !isStepDone(session, step.id, justFinished)) ?? null;
}
