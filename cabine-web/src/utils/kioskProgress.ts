export type KioskStepId = 'saudeGeral' | 'saudeMental' | 'bia' | 'oximetro';

/** Campos da sessão do totem usados para saber o que já foi feito. */
export type VisitProgressInput = {
    saudeGeral: unknown;
    saudeMental: { completedAt?: string; refused?: boolean } | null;
    lastMeasurement: unknown;
    lastOximeter: unknown;
};

export type NextKioskStep = {
    id: KioskStepId;
    path: '/saude-geral' | '/saude-mental' | '/bioimpedancia' | '/oximetro';
    label: string;
};

const STEPS: NextKioskStep[] = [
    { id: 'saudeGeral', path: '/saude-geral', label: 'Ir para saúde geral' },
    { id: 'saudeMental', path: '/saude-mental', label: 'Ir para saúde mental' },
    { id: 'bia', path: '/bioimpedancia', label: 'Ir para bioimpedância' },
    { id: 'oximetro', path: '/oximetro', label: 'Ir para oximetria' },
];

export function isMentalDone(session: VisitProgressInput): boolean {
    return Boolean(session.saudeMental?.completedAt || session.saudeMental?.refused);
}

function isStepDone(session: VisitProgressInput, id: KioskStepId, justFinished?: KioskStepId): boolean {
    if (justFinished === id) return true;
    if (id === 'saudeGeral') return Boolean(session.saudeGeral);
    if (id === 'saudeMental') return isMentalDone(session);
    if (id === 'bia') return Boolean(session.lastMeasurement);
    return Boolean(session.lastOximeter);
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
