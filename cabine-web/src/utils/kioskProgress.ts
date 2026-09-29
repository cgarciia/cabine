import { MVP_VERSION } from '../config/mvp';

export type KioskStepId =
    | 'generalHealth'
    | 'mentalHealth'
    | 'bia'
    | 'oximeter'
    | 'bloodPressure'
    | 'wristBloodPressure';

/** Kiosk session fields used to know which steps are already done. */
export type VisitProgressInput = {
    generalHealth: unknown;
    mentalHealth: { completedAt?: string; refused?: boolean } | null;
    lastMeasurement: unknown;
    lastOximeter: unknown;
    lastBloodPressure: unknown;
    lastWristBloodPressure: unknown;
};

export type NextKioskStep = {
    id: KioskStepId;
    path: '/saude-geral' | '/saude-mental' | '/bioimpedancia' | '/oximetro' | '/pressao' | '/pressao-pulso';
    label: string;
};

/** Etapas obrigatórias do MVP 1. */
const MVP1_STEPS: NextKioskStep[] = [
    { id: 'generalHealth', path: '/saude-geral', label: 'Ir para saúde geral' },
    { id: 'mentalHealth', path: '/saude-mental', label: 'Ir para saúde mental' },
    { id: 'bia', path: '/bioimpedancia', label: 'Ir para peso e bioimpedância' },
    { id: 'oximeter', path: '/oximetro', label: 'Ir para oxigenação' },
];

/** Etapas obrigatórias do MVP 2. */
const MVP2_STEPS: NextKioskStep[] = [
    { id: 'oximeter', path: '/oximetro', label: 'Ir para oxigenação' },
    { id: 'bloodPressure', path: '/pressao', label: 'Ir para pressão com ECG' },
    { id: 'wristBloodPressure', path: '/pressao-pulso', label: 'Ir para pressão e pulso' },
];

/** Etapas ativas no MVP atual. */
const STEPS: NextKioskStep[] = MVP_VERSION === 1 ? MVP1_STEPS : MVP2_STEPS;

export function isMentalDone(session: VisitProgressInput): boolean {
    return Boolean(session.mentalHealth?.completedAt || session.mentalHealth?.refused);
}

function isStepDone(session: VisitProgressInput, id: KioskStepId, justFinished?: KioskStepId): boolean {
    if (justFinished === id) return true;
    if (id === 'generalHealth') return Boolean(session.generalHealth);
    if (id === 'mentalHealth') return isMentalDone(session);
    if (id === 'bia') return Boolean(session.lastMeasurement);
    if (id === 'oximeter') return Boolean(session.lastOximeter);
    if (id === 'bloodPressure') return Boolean(session.lastBloodPressure);
    return Boolean(session.lastWristBloodPressure);
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
