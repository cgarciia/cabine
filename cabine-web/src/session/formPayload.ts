import type { QuestionnaireDef, QuestionnaireScore } from '../modules/health/questionnaires';
import { GATE_OPTIONS, GATE_QUESTIONS } from '../modules/mental/instruments';
import type { CabineSession } from './cabineSession';

export function healthKioskPayload(def: QuestionnaireDef, score: QuestionnaireScore) {
    return {
        title: def.title,
        source: 'kiosk',
        percent: score.percent,
        total: score.total,
        max: score.max,
        label: score.label,
        findings: score.findings,
        items: score.items,
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
