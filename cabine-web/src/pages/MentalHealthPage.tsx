import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppLayout } from '../components/AppLayout';
import { QuestionPane, useQuestionAdvance } from '../components/QuestionAdvance';
import {
    GATE_OPTIONS,
    GATE_QUESTIONS,
    instrumentItems,
    instrumentMinutes,
} from '../modules/mental/instruments';
import { mentalAdvice } from '../advice/patientAdvice';
import { saveFormSubmission } from '../api';
import {
    needsSafety,
    patientResultCopy,
    pickPatientResult,
    routeInstrument,
    scoreInstrument,
} from '../modules/mental/scoring';
import {
    loadSession,
    patchSession,
    type CabineSession,
    type MentalInstrumentId,
    type MentalInstrumentLog,
    type MentalResult,
} from '../session/cabineSession';
import { loadCurrentPersonId } from '../session/currentPerson';
import { mentalPayload } from '../session/formPayload';

type Step = 'invite' | 'gate' | 'instrument' | 'optional' | 'safety' | 'result' | 'done';

export function MentalHealthPage() {
    const navigate = useNavigate();
    const started = useMemo(() => new Date().toISOString(), []);
    const advance = useQuestionAdvance();
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

    const items = instrumentItems(active);
    const progress = stepProgress(step, gateIndex, itemIndex, items.length);
    const questionStep = step === 'gate' || step === 'instrument';
    const paneKey = step === 'gate'
        ? `g-${gateIndex}`
        : step === 'instrument'
            ? `${active}-${itemIndex}`
            : step;
    const shown = pickPatientResult(results);
    const advice = shown?.tone === 'ok' ? [] : mentalAdvice(results).slice(0, 1);

    function persist(partial: Partial<NonNullable<CabineSession['mental']>>) {
        const current = loadSession().mental ?? { results: [] };
        return patchSession({ mental: { ...current, startedAt: current.startedAt ?? started, instrumentLog, ...partial } }).mental;
    }

    async function saveMental(mental: NonNullable<CabineSession['mental']>, status: string) {
        const personId = loadCurrentPersonId();
        if (!personId) return;
        try {
            await saveFormSubmission({
                person_id: personId,
                module: 'mental',
                status,
                payload: mentalPayload(mental),
            });
        } catch {
            /* sessão local desta pessoa permanece */
        }
    }

    function afterInstrument(nextResults: MentalResult[], finishedOptional: boolean, nextLog: MentalInstrumentLog[]) {
        const who = nextResults.find((item) => item.instrument === 'WHO-5');
        const offerHad = !finishedOptional && primary === 'WHO-5' && (who?.score ?? 100) <= 28 && !nextResults.some((item) => item.instrument === 'HAD');
        const offerAudit = !finishedOptional && optional === 'AUDIT' && !nextResults.some((item) => item.instrument === 'AUDIT');
        if (offerHad) {
            persist({ results: nextResults, optionalOffered: 'HAD', instrumentLog: nextLog });
            setOptional('HAD');
            setStep('optional');
            return;
        }
        if (offerAudit) {
            persist({ results: nextResults, optionalOffered: 'AUDIT', instrumentLog: nextLog });
            setStep('optional');
            return;
        }
        const flagged = needsSafety(nextResults);
        const stored = persist({
            results: nextResults,
            safetyTriggered: flagged,
            completedAt: new Date().toISOString(),
            instrumentLog: nextLog,
        });
        if (stored) void saveMental(stored, 'completed');
        setStep(flagged ? 'safety' : 'result');
    }

    function applyGate(score: number) {
        const next = [...gate];
        next[gateIndex] = score;
        setGate(next);
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
        persist({
            accepted: true,
            invitedAt: started,
            gate: next,
            instrument: route.primary,
            optionalOffered: route.optional ?? undefined,
            results: [],
        });
        setStep('instrument');
    }

    function applyItem(optionIndex: number) {
        const nextAnswers = [...answers];
        nextAnswers[itemIndex] = optionIndex;
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
    }

    function refuseInvite() {
        const stored = persist({ invitedAt: started, accepted: false, refusedAt: new Date().toISOString(), results: [] });
        if (stored) void saveMental(stored, 'refused');
        setStep('done');
    }

    function startOptional(yes: boolean) {
        persist({ optionalAccepted: yes });
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

    function goBackQuestion() {
        if (step === 'instrument' && itemIndex > 0) {
            setItemIndex(itemIndex - 1);
            return;
        }
        if (step === 'instrument' && itemIndex === 0 && active !== primary) {
            setStep('optional');
            return;
        }
        if (step === 'instrument' && itemIndex === 0 && active === primary) {
            setStep('gate');
            setGateIndex(3);
            return;
        }
        if (step === 'gate' && gateIndex > 0) {
            setGateIndex(gateIndex - 1);
            return;
        }
        if (step === 'gate') setStep('invite');
    }

    const canBack = step === 'gate' || step === 'instrument';

    useEffect(() => {
        if (!loadCurrentPersonId()) navigate('/', { replace: true });
    }, [navigate]);

    return (
        <AppLayout>
            <div className="cabine-stage">
                <div className="cabine-hero cabine-flow">
                    <div className={`cabine-flow-meta ${advance.leaving ? 'is-bump' : ''}`}>
                        <span>{stepLabel(step, gateIndex, itemIndex, items.length)}</span>
                        <span>{stepTime(step, active)}</span>
                    </div>
                    <div className="cabine-track"><div className="cabine-fill" style={{ width: `${progress}%` }} /></div>

                    <QuestionPane paneKey={paneKey} leaving={advance.leaving} leaveDir={advance.leaveDir}>
                        {step === 'invite' && (
                            <>
                                <p className="cabine-kicker">Saúde mental</p>
                                <h1 className="cabine-question">Quer saber como você tem se sentido?</h1>
                                <p className="cabine-sub">
                                    São 4 perguntas rápidas sobre seu bem-estar emocional. Se necessário, o sistema pode sugerir algumas perguntas adicionais.
                                </p>
                                <p className="cabine-sub">
                                    Suas respostas são confidenciais e o resultado aparece somente para você. A empresa recebe apenas dados gerais, sem identificação. Este é um rastreio e não substitui avaliação profissional.
                                </p>
                                <div className="cabine-flow-actions">
                                    <button
                                        type="button"
                                        className="cabine-btn pri"
                                        onClick={() => advance.select('yes', () => {
                                            persist({ invitedAt: started, accepted: true, results: [] });
                                            setStep('gate');
                                        })}
                                    >
                                        Quero responder
                                    </button>
                                    <button type="button" className="cabine-btn" onClick={() => advance.select('no', refuseInvite)}>
                                        Prefiro não responder
                                    </button>
                                </div>
                            </>
                        )}

                        {questionStep && step === 'gate' && (
                            <>
                                <p className="cabine-kicker">Saúde mental</p>
                                <h1 className="cabine-question">{GATE_QUESTIONS[gateIndex]}</h1>
                                <div className="cabine-options">
                                    {GATE_OPTIONS.map((option) => (
                                        <button
                                            key={option.label}
                                            type="button"
                                            className={`cabine-opt ${advance.picked === option.label || gate[gateIndex] === option.score ? 'is-on' : ''} ${advance.picked === option.label ? 'is-picked' : ''}`}
                                            onClick={() => advance.select(option.label, () => applyGate(option.score))}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="cabine-hint">Toque na resposta. A próxima pergunta entra em seguida.</p>
                                <div className="cabine-flow-actions">
                                    <button type="button" className="cabine-btn" disabled={!canBack} onClick={() => advance.goBack(goBackQuestion)}>
                                        Voltar
                                    </button>
                                </div>
                            </>
                        )}

                        {questionStep && step === 'instrument' && (
                            <>
                                <p className="cabine-kicker">Saúde mental</p>
                                <h1 className="cabine-question">{items[itemIndex].text}</h1>
                                <div className="cabine-options">
                                    {items[itemIndex].options.map((option, optionIndex) => {
                                        const pickedHere = advance.picked === option.label || answers[itemIndex] === optionIndex;
                                        return (
                                            <button
                                                key={option.label}
                                                type="button"
                                                className={`cabine-opt ${pickedHere ? 'is-on' : ''} ${advance.picked === option.label ? 'is-picked' : ''}`}
                                                onClick={() => advance.select(option.label, () => applyItem(optionIndex))}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="cabine-hint">Toque na resposta. A próxima pergunta entra em seguida.</p>
                                <div className="cabine-flow-actions">
                                    <button type="button" className="cabine-btn" onClick={() => advance.goBack(goBackQuestion)}>
                                        Voltar
                                    </button>
                                </div>
                            </>
                        )}

                        {step === 'optional' && (
                            <>
                                <p className="cabine-kicker">Saúde mental</p>
                                <h1 className="cabine-question">
                                    {optional === 'AUDIT'
                                        ? 'Quer responder mais 10 perguntas rápidas sobre álcool?'
                                        : 'Suas respostas sugerem que vale aprofundar um pouco. Quer responder mais algumas perguntas agora?'}
                                </h1>
                                <p className="cabine-sub">
                                    {optional === 'AUDIT'
                                        ? `São cerca de ${instrumentMinutes('AUDIT')} minutos. Se preferir, isso pode ficar para outra visita.`
                                        : 'São mais algumas perguntas, cerca de 3 minutos. Se preferir, isso pode ficar para outra visita.'}
                                </p>
                                <div className="cabine-flow-actions">
                                    <button type="button" className="cabine-btn pri" onClick={() => advance.select('opt-yes', () => startOptional(true))}>
                                        Sim, continuar
                                    </button>
                                    <button type="button" className="cabine-btn" onClick={() => advance.select('opt-no', () => startOptional(false))}>
                                        Agora não
                                    </button>
                                </div>
                            </>
                        )}

                        {step === 'safety' && (
                            <>
                                <p className="cabine-kicker">Saúde mental</p>
                                <div className="cabine-band is-alert">
                                    <p>Queremos falar com você agora</p>
                                    <span>Suas respostas indicam que este é um bom momento para conversar com alguém. Um profissional pode atender você agora mesmo.</span>
                                </div>
                                <p className="cabine-sub">Se preferir, ligue para o CVV no <strong>188</strong>, disponível 24 horas.</p>
                                <div className="cabine-flow-actions">
                                    <button type="button" className="cabine-btn pri" onClick={() => advance.select('talk', () => setStep('result'))}>
                                        Falar com profissional agora
                                    </button>
                                    <button type="button" className="cabine-btn" onClick={() => advance.select('see', () => setStep('result'))}>
                                        Ver meu resultado
                                    </button>
                                </div>
                            </>
                        )}

                        {step === 'result' && (
                            <>
                                <p className="cabine-kicker">Saúde mental</p>
                                <h1 className="cabine-question">Resultado da sua avaliação</h1>
                                {shown ? (
                                    <div className={`cabine-band is-${shown.tone}`}>
                                        <p>Seu rastreio</p>
                                        <span>{patientBandLabel(shown)}</span>
                                    </div>
                                ) : null}
                                <p className="cabine-sub">{patientResultCopy(results)}</p>
                                {advice.length ? (
                                    <ul className="cabine-advice-list">
                                        {advice.map((item) => <li key={item}>{item}</li>)}
                                    </ul>
                                ) : null}
                                <p className="cabine-disclaimer">Este resultado é um rastreio e não estabelece diagnóstico.</p>
                                <div className="cabine-flow-actions">
                                    <button type="button" className="cabine-btn pri" onClick={() => advance.select('next', () => setStep('done'))}>
                                        Continuar
                                    </button>
                                </div>
                            </>
                        )}

                        {step === 'done' && (
                            <>
                                <p className="cabine-kicker">Saúde mental</p>
                                <h1 className="cabine-question">Obrigado por participar</h1>
                                <p className="cabine-sub">
                                    Se você quiser conversar sobre apoio em saúde, o RH pode orientar sobre os canais disponíveis na empresa, como convênio, apoio psicológico e afastamentos.
                                </p>
                                <p className="cabine-sub">
                                    <strong>Você não precisa informar o resultado desta avaliação para pedir orientação.</strong>
                                </p>
                                <div className="cabine-flow-actions">
                                    <button type="button" className="cabine-btn pri" onClick={() => navigate('/')}>Voltar ao início</button>
                                    <button type="button" className="cabine-btn" onClick={() => navigate('/avaliacao')}>Ir para a balança</button>
                                </div>
                            </>
                        )}
                    </QuestionPane>
                </div>
            </div>
        </AppLayout>
    );
}

function patientBandLabel(result: MentalResult) {
    if (result.tone === 'ok') return 'Por agora, o sinal está tranquilo';
    if (result.tone === 'watch') return 'Vale observar nas próximas semanas';
    return 'Vale um cuidado a mais agora';
}

function stepLabel(step: Step, gateIndex: number, itemIndex: number, total: number) {
    if (step === 'invite') return 'Convite';
    if (step === 'gate') return `Pergunta ${gateIndex + 1} de 4`;
    if (step === 'instrument') return `Pergunta ${itemIndex + 1} de ${total}`;
    if (step === 'optional') return 'Convite extra';
    if (step === 'safety') return 'Acolhimento';
    if (step === 'result') return 'Resultado';
    return 'Orientação final';
}

function stepTime(step: Step, instrument: MentalInstrumentId) {
    if (step === 'invite') return '10 s';
    if (step === 'gate') return '30 s';
    if (step === 'instrument') return `${instrumentMinutes(instrument)} min`;
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
