import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppLayout } from '../components/AppLayout';
import { QuestionPane, useQuestionAdvance } from '../components/QuestionAdvance';
import { healthAdvice } from '../advice/patientAdvice';
import {
    HEALTH_QUESTIONS,
    healthDetailKey,
    healthDetailText,
    healthFollowUpVisible,
    isHealthAnswered,
} from '../modules/health/questions';
import { saveFormSubmission } from '../api';
import { loadSession, patchSession, type HealthAnswers } from '../session/cabineSession';
import { loadCurrentPersonId } from '../session/currentPerson';
import { healthPayload } from '../session/formPayload';

export function HealthPage() {
    const navigate = useNavigate();
    const personId = loadCurrentPersonId();
    const existing = loadSession().health?.answers ?? {};
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState<HealthAnswers>(existing);
    const advance = useQuestionAdvance();
    const question = HEALTH_QUESTIONS[index];
    const value = answers[question.id];
    const progress = ((index + 1) / HEALTH_QUESTIONS.length) * 100;
    const canNext = isHealthAnswered(question, answers);
    const selectedList = useMemo(() => (Array.isArray(value) ? value : []), [value]);
    const isMulti = question.type === 'checkbox';
    const showFollowUp = healthFollowUpVisible(question, value);
    const exclusive = question.type === 'checkbox' ? question.exclusiveOption : undefined;
    const needsManualNext = isMulti
        ? advance.picked !== exclusive
        : showFollowUp;

    useEffect(() => {
        if (!personId) navigate('/', { replace: true });
    }, [navigate, personId]);

    async function persistAndFinish(nextAnswers: HealthAnswers) {
        patchSession({
            health: { completedAt: new Date().toISOString(), answers: nextAnswers },
        });
        const personId = loadCurrentPersonId();
        if (personId) {
            try {
                await saveFormSubmission({
                    person_id: personId,
                    module: 'health',
                    status: 'completed',
                    payload: healthPayload(nextAnswers),
                });
            } catch {
                /* resposta permanece na sessão local desta pessoa */
            }
        }
        navigate('/saude/fim');
    }

    function goForward(nextAnswers: HealthAnswers) {
        if (index >= HEALTH_QUESTIONS.length - 1) void persistAndFinish(nextAnswers);
        else setIndex((current) => current + 1);
    }

    function setDetail(text: string) {
        setAnswers((current) => ({ ...current, [healthDetailKey(question.id)]: text }));
    }

    function clearDetail(next: HealthAnswers) {
        const { [healthDetailKey(question.id)]: _removed, ...rest } = next;
        return rest;
    }

    function setRadio(option: string) {
        const wantsFollowUp = question.type === 'radio' && question.followUpWhen === option;
        const next = wantsFollowUp
            ? { ...answers, [question.id]: option }
            : clearDetail({ ...answers, [question.id]: option });
        setAnswers(next);
        if (wantsFollowUp) return;
        advance.select(option, () => goForward(next));
    }

    function toggleCheck(option: string) {
        if (exclusive && option === exclusive) {
            const next = clearDetail({ ...answers, [question.id]: [exclusive] });
            setAnswers(next);
            advance.select(option, () => goForward(next));
            return;
        }
        setAnswers((current) => {
            const prev = Array.isArray(current[question.id]) ? [...(current[question.id] as string[])] : [];
            let nextVals = prev.filter((item) => item !== exclusive);
            if (nextVals.includes(option)) nextVals = nextVals.filter((item) => item !== option);
            else nextVals.push(option);
            const next = { ...current, [question.id]: nextVals };
            const followUpOption = question.type === 'checkbox' ? question.followUpOption : undefined;
            if (followUpOption && !nextVals.includes(followUpOption)) return clearDetail(next);
            return next;
        });
    }

    return (
        <AppLayout>
            <div className="cabine-stage">
                <div className="cabine-hero cabine-flow">
                    <div className={`cabine-flow-meta ${advance.leaving ? 'is-bump' : ''}`}>
                        <span>Pergunta {index + 1} de {HEALTH_QUESTIONS.length}</span>
                        <span>~4 min</span>
                    </div>
                    <div className="cabine-track"><div className="cabine-fill" style={{ width: `${progress}%` }} /></div>
                    <QuestionPane paneKey={question.id} leaving={advance.leaving} leaveDir={advance.leaveDir}>
                        <p className="cabine-kicker">Saúde geral</p>
                        <h1 className="cabine-question">{question.text}</h1>
                        <div className="cabine-options">
                            {question.options.map((option) => {
                                const active = isMulti
                                    ? selectedList.includes(option) || advance.picked === option
                                    : value === option || advance.picked === option;
                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        className={`cabine-opt ${active ? 'is-on' : ''} ${advance.picked === option ? 'is-picked' : ''}`}
                                        onClick={() => (isMulti ? toggleCheck(option) : setRadio(option))}
                                    >
                                        {option}
                                    </button>
                                );
                            })}
                        </div>
                        {showFollowUp ? (
                            <div className="cabine-followup">
                                <label htmlFor={`follow-${question.id}`}>{question.followUpPrompt}</label>
                                <textarea
                                    id={`follow-${question.id}`}
                                    className="cabine-followup-input"
                                    rows={2}
                                    value={healthDetailText(answers, question.id)}
                                    placeholder={question.followUpPlaceholder}
                                    onChange={(event) => setDetail(event.target.value)}
                                />
                            </div>
                        ) : null}
                        {isMulti && exclusive && advance.picked !== exclusive ? (
                            <p className="cabine-hint">Pode marcar mais de um. Toque em Continuar quando terminar.</p>
                        ) : showFollowUp ? (
                            <p className="cabine-hint">Escreva o detalhe e toque em Continuar.</p>
                        ) : (
                            <p className="cabine-hint">Toque na resposta. A próxima pergunta entra em seguida.</p>
                        )}
                        <div className="cabine-flow-actions">
                            <button
                                type="button"
                                className="cabine-btn"
                                disabled={index === 0}
                                onClick={() => advance.goBack(() => setIndex((current) => current - 1))}
                            >
                                Voltar
                            </button>
                            {needsManualNext ? (
                                <button
                                    type="button"
                                    className="cabine-btn pri"
                                    disabled={!canNext}
                                    onClick={() => advance.select('__next', () => goForward(answers))}
                                >
                                    {index === HEALTH_QUESTIONS.length - 1 ? 'Concluir' : 'Continuar'}
                                </button>
                            ) : null}
                        </div>
                    </QuestionPane>
                </div>
            </div>
        </AppLayout>
    );
}

export function HealthDonePage() {
    const navigate = useNavigate();
    const recs = healthAdvice(loadSession().health?.answers);
    return (
        <AppLayout>
            <div className="cabine-stage">
                <div className="cabine-hero cabine-flow">
                    <p className="cabine-kicker">Saúde geral</p>
                    <h1 className="cabine-question">Obrigado por responder</h1>
                    <p className="cabine-sub">Aqui vão só lembretes de cuidado. Nada disso é um diagnóstico ou um rótulo.</p>
                    <ul className="cabine-advice-list">
                        {recs.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                    <h2 className="cabine-question" style={{ fontSize: '1.35rem', marginTop: 8 }}>
                        Quer conhecer melhor como está sua saúde emocional?
                    </h2>
                    <p className="cabine-sub">
                        Se desejar, você pode responder algumas perguntas rápidas sobre sono, estresse, ansiedade
                        e bem-estar emocional. Essa etapa é opcional.
                    </p>
                    <div className="cabine-flow-actions">
                        <button type="button" className="cabine-btn pri" onClick={() => navigate('/saude-mental')}>
                            Quero responder
                        </button>
                        <button type="button" className="cabine-btn" onClick={() => navigate('/avaliacao')}>
                            Ir para a balança
                        </button>
                        <button type="button" className="cabine-btn" onClick={() => navigate('/')}>
                            Prefiro finalizar
                        </button>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
