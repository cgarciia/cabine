import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { mentalAdvice } from '../../advice/patientAdvice';
import { saveFormSubmission } from '../../api';
import { AfterStepScreen } from '../../components/AfterStepScreen';
import { KioskOptionContent, optionScaleClass } from '../../components/KioskOptionContent';
import { KioskQuizHeading } from '../../components/KioskQuizHeading';
import {
    GATE_OPTIONS,
    GATE_QUESTIONS,
    instrumentItems,
    instrumentMinutes,
} from '../../modules/mental/instruments';
import {
    needsSafety,
    patientResultCopy,
    pickPatientResult,
    routeInstrument,
    scoreInstrument,
} from '../../modules/mental/scoring';
import { useKiosk, type MentalKioskSession } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { patchSession } from '../../session/cabineSession';
import { mentalPayload } from '../../session/formPayload';
import type { MentalInstrumentId, MentalInstrumentLog, MentalResult } from '../../types/mental';

type Step = 'invite' | 'gate' | 'instrument' | 'optional' | 'safety' | 'result' | 'done';

export function KioskMentalHealthPage() {
    const navigate = useNavigate();
    const { session, setMentalHealth } = useKiosk();
    const started = useMemo(() => new Date().toISOString(), []);
    const [step, setStep] = useState<Step>('invite');
    const [gateIndex, setGateIndex] = useState(0);
    const [gate, setGate] = useState<number[]>([NaN, NaN, NaN, NaN]);
    const [primary, setPrimary] = useState<MentalInstrumentId>('WHO-5');
    const [optional, setOptional] = useState<MentalInstrumentId | null>(null);
    const [active, setActive] = useState<MentalInstrumentId>('WHO-5');
    const [itemIndex, setItemIndex] = useState(0);
    const [answers, setAnswers] = useState<number[]>([]);
    const [instrumentLog, setInstrumentLog] = useState<MentalInstrumentLog[]>([]);
    const [results, setResults] = useState<MentalResult[]>([]);
    const [flashId, setFlashId] = useState<string | null>(null);

    const items = instrumentItems(active);
    const progress = stepProgress(step, gateIndex, itemIndex, items.length);
    const questionStep = step === 'gate' || step === 'instrument';
    const shown = pickPatientResult(results);
    const advice = shown?.tone === 'ok' ? [] : mentalAdvice(results).slice(0, 1);

    if (!session.person) return <Navigate to="/matricula" replace />;

    function storeKiosk(partial: Partial<MentalKioskSession>) {
        const next: MentalKioskSession = {
            accepted: partial.accepted ?? true,
            refused: partial.refused,
            gate: partial.gate ?? gate.filter((n) => Number.isFinite(n)),
            results: partial.results ?? results,
            safetyTriggered: partial.safetyTriggered,
            completedAt: partial.completedAt,
            instrument: partial.instrument ?? active,
            instrumentLog: partial.instrumentLog ?? instrumentLog,
        };
        setMentalHealth(next);
        return next;
    }

    async function saveMental(status: string, mental: MentalKioskSession) {
        const personId = session.person?.id;
        if (!personId) return;
        const payload = {
            invitedAt: started,
            accepted: mental.accepted,
            refusedAt: mental.refused ? new Date().toISOString() : undefined,
            gate: mental.gate,
            instrument: mental.instrument,
            results: mental.results,
            safetyTriggered: mental.safetyTriggered,
            completedAt: mental.completedAt,
            startedAt: started,
            instrumentLog,
        };
        patchSession({ mental: payload });
        try {
            await saveFormSubmission({
                person_id: personId,
                module: 'mental',
                status,
                payload: mentalPayload(payload),
                visit_id: session.visitId,
            });
        } catch {
            /* sessão local permanece */
        }
    }

    function afterInstrument(nextResults: MentalResult[], finishedOptional: boolean, nextLog: MentalInstrumentLog[]) {
        const who = nextResults.find((item) => item.instrument === 'WHO-5');
        const offerHad =
            !finishedOptional
            && primary === 'WHO-5'
            && (who?.score ?? 100) <= 28
            && !nextResults.some((item) => item.instrument === 'HAD');
        const offerAudit =
            !finishedOptional
            && optional === 'AUDIT'
            && !nextResults.some((item) => item.instrument === 'AUDIT');

        if (offerHad) {
            setOptional('HAD');
            setStep('optional');
            return;
        }
        if (offerAudit) {
            setStep('optional');
            return;
        }

        const flagged = needsSafety(nextResults);
        const completedAt = new Date().toISOString();
        const stored = storeKiosk({
            accepted: true,
            gate: gate.filter((n) => Number.isFinite(n)),
            results: nextResults,
            safetyTriggered: flagged,
            completedAt,
            instrument: primary,
            instrumentLog: nextLog,
        });
        setInstrumentLog(nextLog);
        void saveMental('completed', stored);
        setStep(flagged ? 'safety' : 'result');
    }

    function applyGate(score: number) {
        const next = [...gate];
        next[gateIndex] = score;
        setGate(next);
        setFlashId(String(score));
        window.setTimeout(() => {
            setFlashId(null);
            if (gateIndex < 3) {
                setGateIndex(gateIndex + 1);
                return;
            }
            const route = routeInstrument(next);
            setPrimary(route.primary);
            setOptional(route.optional);
            setActive(route.primary);
            setItemIndex(0);
            setAnswers([]);
            storeKiosk({
                accepted: true,
                gate: next,
                results: [],
                instrument: route.primary,
            });
            setStep('instrument');
        }, 220);
    }

    function applyItem(optionIndex: number) {
        const nextAnswers = [...answers];
        nextAnswers[itemIndex] = optionIndex;
        setFlashId(items[itemIndex].options[optionIndex]?.label ?? String(optionIndex));
        window.setTimeout(() => {
            setFlashId(null);
            if (itemIndex < items.length - 1) {
                setAnswers(nextAnswers);
                setItemIndex(itemIndex + 1);
                return;
            }
            const scored = scoreInstrument(active, nextAnswers, items);
            const nextResults = [...results.filter((item) => item.instrument !== scored.instrument), scored];
            const logEntry: MentalInstrumentLog = {
                instrument: active,
                items: items.map((item, index) => ({
                    id: item.id,
                    text: item.text,
                    label: item.options[nextAnswers[index]]?.label ?? '',
                    score: item.options[nextAnswers[index]]?.score ?? 0,
                })),
            };
            const nextLog = [...instrumentLog.filter((entry) => entry.instrument !== active), logEntry];
            setInstrumentLog(nextLog);
            setResults(nextResults);
            afterInstrument(nextResults, active !== primary, nextLog);
            setAnswers([]);
            setItemIndex(0);
        }, 220);
    }

    function refuseInvite() {
        const stored = storeKiosk({
            accepted: false,
            refused: true,
            gate: [],
            results: [],
            completedAt: new Date().toISOString(),
        });
        void saveMental('refused', stored);
        setStep('done');
    }

    function startOptional(yes: boolean) {
        if (!yes) {
            afterInstrument(results, true, instrumentLog);
            return;
        }
        const next = optional ?? 'HAD';
        setActive(next);
        setAnswers([]);
        setItemIndex(0);
        setStep('instrument');
    }

    function goBack() {
        if (step === 'instrument' && itemIndex > 0) {
            setItemIndex(itemIndex - 1);
            return;
        }
        if (step === 'instrument' && itemIndex === 0 && active !== primary) {
            setStep('optional');
            return;
        }
        if (step === 'instrument' && itemIndex === 0) {
            setStep('gate');
            setGateIndex(3);
            return;
        }
        if (step === 'gate' && gateIndex > 0) {
            setGateIndex(gateIndex - 1);
            return;
        }
        if (step === 'gate') {
            setStep('invite');
            return;
        }
        navigate('/menu');
    }

    if (step === 'done') {
        return (
            <KioskLayout>
                <AfterStepScreen
                    justFinished="mentalHealth"
                    title="Saúde mental concluída"
                    description={
                        session.mentalHealth?.refused
                            ? 'Você optou por não responder agora. Pode seguir para a próxima etapa quando quiser.'
                            : 'Obrigado por participar. Suas respostas ficam nesta sessão e o resultado é só para você.'
                    }
                />
            </KioskLayout>
        );
    }

    return (
        <KioskLayout>
            <div className="kiosk-quiz">
                <div className="kiosk-quiz-meta">
                    <div className="kiosk-quiz-meta-main">
                        <div className="kiosk-quiz-progress-label">
                            {stepLabel(step, gateIndex, itemIndex, items.length)}
                        </div>
                        <div className="kiosk-progress-track" aria-hidden>
                            <div className="kiosk-progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                    <div className="kiosk-quiz-eta">{stepTime(step, active)}</div>
                </div>

                <KioskQuizHeading
                    category="Saúde Mental"
                    onBack={
                        step === 'gate' || step === 'instrument' || step === 'invite'
                            ? goBack
                            : undefined
                    }
                />

                {step === 'invite' ? (
                    <>
                        <h1 className="kiosk-quiz-question">Quer saber como você tem se sentido?</h1>
                        <p className="kiosk-subtitle" style={{ textAlign: 'left', maxWidth: 640 }}>
                            São 4 perguntas rápidas sobre seu bem-estar emocional. Se necessário, o sistema
                            pode sugerir algumas perguntas adicionais.
                        </p>
                        <p className="kiosk-subtitle" style={{ textAlign: 'left', maxWidth: 640 }}>
                            Suas respostas são confidenciais e o resultado aparece somente para você. Este é
                            um rastreio e não substitui avaliação profissional.
                        </p>
                        <div className="kiosk-menu-actions" style={{ marginTop: '1.25rem' }}>
                            <button
                                type="button"
                                className="kiosk-btn kiosk-btn-primary kiosk-btn-xl"
                                onClick={() => setStep('gate')}
                            >
                                Quero responder
                            </button>
                            <button
                                type="button"
                                className="kiosk-btn kiosk-btn-ghost"
                                onClick={refuseInvite}
                            >
                                Prefiro não responder
                            </button>
                        </div>
                    </>
                ) : null}

                {questionStep && step === 'gate' ? (
                    <>
                        <h1 className="kiosk-quiz-question">{GATE_QUESTIONS[gateIndex]}</h1>
                        <div className="kiosk-option-list">
                            {GATE_OPTIONS.map((option) => {
                                const activeOpt =
                                    flashId === String(option.score) || gate[gateIndex] === option.score;
                                const scores = GATE_OPTIONS.map((item) => item.score);
                                return (
                                    <button
                                        key={option.label}
                                        type="button"
                                        className={`kiosk-option${activeOpt ? ' selected' : ''}${optionScaleClass(option.score, scores, false)}`}
                                        onClick={() => applyGate(option.score)}
                                    >
                                        <KioskOptionContent
                                            label={option.label}
                                            score={option.score}
                                            scores={scores}
                                            higherIsBetter={false}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </>
                ) : null}

                {questionStep && step === 'instrument' ? (
                    <>
                        <p className="kiosk-muted" style={{ marginBottom: 8 }}>
                            Instrumento {active} · cerca de {instrumentMinutes(active)} min
                        </p>
                        <h1 className="kiosk-quiz-question">{items[itemIndex].text}</h1>
                        <div className="kiosk-option-list">
                            {items[itemIndex].options.map((option, optionIndex) => {
                                const activeOpt =
                                    flashId === option.label || answers[itemIndex] === optionIndex;
                                const scores = items[itemIndex].options.map((item) => item.score);
                                const higherIsBetter = active === 'WHO-5';
                                return (
                                    <button
                                        key={option.label}
                                        type="button"
                                        className={`kiosk-option${activeOpt ? ' selected' : ''}${optionScaleClass(option.score, scores, higherIsBetter)}`}
                                        onClick={() => applyItem(optionIndex)}
                                    >
                                        <KioskOptionContent
                                            label={option.label}
                                            score={option.score}
                                            scores={scores}
                                            higherIsBetter={higherIsBetter}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </>
                ) : null}

                {step === 'optional' ? (
                    <>
                        <h1 className="kiosk-quiz-question">
                            {optional === 'AUDIT'
                                ? 'Quer responder mais 10 perguntas rápidas sobre álcool?'
                                : 'Suas respostas sugerem que vale aprofundar um pouco. Quer responder mais algumas perguntas agora?'}
                        </h1>
                        <p className="kiosk-subtitle" style={{ textAlign: 'left' }}>
                            {optional === 'AUDIT'
                                ? `São cerca de ${instrumentMinutes('AUDIT')} minutos. Se preferir, isso pode ficar para outra visita.`
                                : 'São mais algumas perguntas, cerca de 3 minutos. Se preferir, isso pode ficar para outra visita.'}
                        </p>
                        <div className="kiosk-menu-actions">
                            <button
                                type="button"
                                className="kiosk-btn kiosk-btn-primary"
                                onClick={() => startOptional(true)}
                            >
                                Sim, continuar
                            </button>
                            <button
                                type="button"
                                className="kiosk-btn kiosk-btn-ghost"
                                onClick={() => startOptional(false)}
                            >
                                Agora não
                            </button>
                        </div>
                    </>
                ) : null}

                {step === 'safety' ? (
                    <>
                        <div className="kiosk-band is-alert">
                            <strong>Você não precisa passar por isso sozinho</strong>
                            <p>
                                Suas respostas indicam que este é um bom momento para conversar com alguém
                                de confiança — um amigo, um familiar ou um profissional de saúde.
                            </p>
                        </div>
                        <p className="kiosk-subtitle" style={{ textAlign: 'left' }}>
                            Se quiser, ligue para o CVV no <strong>188</strong>, disponível 24 horas.
                        </p>
                        <div className="kiosk-menu-actions">
                            <button
                                type="button"
                                className="kiosk-btn kiosk-btn-primary"
                                onClick={() => setStep('result')}
                            >
                                Ver meu resultado
                            </button>
                        </div>
                    </>
                ) : null}

                {step === 'result' ? (
                    <>
                        <h1 className="kiosk-quiz-question">Resultado da sua avaliação</h1>
                        {shown ? (
                            <div className={`kiosk-band is-${shown.tone}`}>
                                <strong>Seu rastreio</strong>
                                <p>{patientBandLabel(shown)}</p>
                            </div>
                        ) : null}
                        <p className="kiosk-subtitle" style={{ textAlign: 'left', maxWidth: 640 }}>
                            {patientResultCopy(results)}
                        </p>
                        {advice.length ? (
                            <ul className="kiosk-advice-list">
                                {advice.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        ) : null}
                        <p className="kiosk-muted" style={{ marginTop: 12 }}>
                            Este resultado é um rastreio e não estabelece diagnóstico.
                        </p>
                        <button
                            type="button"
                            className="kiosk-btn kiosk-btn-primary"
                            style={{ marginTop: 16 }}
                            onClick={() => setStep('done')}
                        >
                            Continuar
                        </button>
                    </>
                ) : null}

            </div>
        </KioskLayout>
    );
}

function patientBandLabel(result: MentalResult) {
    if (result.tone === 'ok') return 'Por agora, o sinal está tranquilo';
    if (result.tone === 'watch') return 'Vale observar nas próximas semanas';
    return 'Vale um cuidado a mais agora';
}

function stepLabel(step: Step, gateIndex: number, itemIndex: number, total: number) {
    if (step === 'invite') return 'Convite';
    if (step === 'gate') return `Entrada ${gateIndex + 1} de 4`;
    if (step === 'instrument') return `Pergunta ${itemIndex + 1} de ${total}`;
    if (step === 'optional') return 'Convite extra';
    if (step === 'safety') return 'Acolhimento';
    if (step === 'result') return 'Resultado';
    return 'Orientação final';
}

function stepTime(step: Step, instrument: MentalInstrumentId) {
    if (step === 'invite') return '10 s';
    if (step === 'gate') return '30 s';
    if (step === 'instrument') return `~${instrumentMinutes(instrument)} min`;
    if (step === 'optional') return 'opcional';
    if (step === 'safety') return 'condicional';
    if (step === 'result') return '20 s';
    return '15 s';
}

function stepProgress(step: Step, gateIndex: number, itemIndex: number, total: number) {
    if (step === 'invite') return 8;
    if (step === 'gate') return 12 + gateIndex * 10;
    if (step === 'instrument') return 55 + (total ? (itemIndex / total) * 25 : 0);
    if (step === 'optional') return 82;
    if (step === 'safety') return 90;
    if (step === 'result') return 94;
    return 100;
}
