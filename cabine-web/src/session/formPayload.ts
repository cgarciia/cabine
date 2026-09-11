import { formatHealthAnswer, HEALTH_QUESTIONS, healthDetailText } from '../modules/health/questions';
import { GATE_OPTIONS, GATE_QUESTIONS } from '../modules/mental/instruments';
import type { HealthAnswers, CabineSession } from './cabineSession';

export function healthPayload(answers: HealthAnswers) {
    return {
        title: 'Saúde geral',
        items: HEALTH_QUESTIONS.map((question) => ({
            id: question.id,
            text: question.text,
            answer: formatHealthAnswer(question, answers),
            detail: healthDetailText(answers, question.id).trim() || undefined,
        })),
    };
}

export function mentalPayload(mental: NonNullable<CabineSession['mental']>) {
    const gateItems = GATE_QUESTIONS.map((text, index) => {
        const score = mental.gate?.[index];
        const option = GATE_OPTIONS.find((item) => item.score === score);
        return {
            id: `p${index + 1}`,
            text,
            answer: option?.label ?? (score == null || Number.isNaN(score) ? '' : String(score)),
            score: score ?? null,
        };
    });
    const started = mental.startedAt ? Date.parse(mental.startedAt) : NaN;
    const ended = mental.completedAt ? Date.parse(mental.completedAt) : Date.now();
    const durationSeconds = Number.isFinite(started) ? Math.max(0, Math.round((ended - started) / 1000)) : null;

    return {
        title: 'Saúde mental',
        accepted: mental.accepted ?? false,
        refused: Boolean(mental.refusedAt),
        instrument: mental.instrument ?? null,
        optionalOffered: mental.optionalOffered ?? null,
        optionalAccepted: mental.optionalAccepted ?? null,
        safetyTriggered: Boolean(mental.safetyTriggered),
        duration_seconds: durationSeconds,
        gate: gateItems,
        instruments: mental.instrumentLog ?? [],
        results: mental.results ?? [],
    };
}
