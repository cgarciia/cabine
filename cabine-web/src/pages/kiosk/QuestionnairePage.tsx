import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { saveFormSubmission } from '../../api';
import { AfterStepScreen } from '../../components/AfterStepScreen';
import { KioskOptionContent, optionScaleClass } from '../../components/KioskOptionContent';
import { KioskQuizHeading } from '../../components/KioskQuizHeading';
import {
    followUpVisible,
    isQuestionAnswered,
    scoreQuestionnaire,
    type AnswerMap,
    type DetailMap,
    type QuestionnaireDef,
} from '../../modules/health/questionnaires';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { healthKioskPayload } from '../../session/formPayload';

type Props = {
    def: QuestionnaireDef;
};

export function QuestionnairePage({ def }: Props) {
    const { session, setGeneralHealth } = useKiosk();
    const navigate = useNavigate();
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState<AnswerMap>({});
    const [details, setDetails] = useState<DetailMap>({});
    const [flashId, setFlashId] = useState<string | null>(null);
    const [completed, setCompleted] = useState(false);
    const [moreBelow, setMoreBelow] = useState(false);
    const listEndRef = useRef<HTMLDivElement>(null);

    const question = def.questions[index];
    const total = def.questions.length;
    const progress = ((index + 1) / total) * 100;
    const minutesLabel = def.estimatedSeconds < 60
        ? `~${def.estimatedSeconds}s`
        : `~${Math.max(1, Math.round(def.estimatedSeconds / 60))} min`;
    const selected = answers[question?.id ?? ''] ?? [];
    const detail = details[question?.id ?? ''] ?? '';
    const showFollowUp = question ? followUpVisible(question, selected) : false;
    const canAdvance = useMemo(
        () => (question ? isQuestionAnswered(question, selected, detail) : false),
        [question, selected, detail],
    );

    useEffect(() => {
        setFlashId(null);
    }, [index]);

    const needsManualNext = Boolean(
        question
        && (
            question.kind === 'multiple'
            || showFollowUp
            || (question.followUpWhenOptionId && selected.includes(question.followUpWhenOptionId))
        ),
    );
    const isMultiple = question?.kind === 'multiple';

    useEffect(() => {
        const el = listEndRef.current;
        if (!el || !needsManualNext) {
            setMoreBelow(false);
            return;
        }
        let intersecting = false;
        function refresh() {
            const nearBottom =
                window.scrollY + window.innerHeight
                >= document.documentElement.scrollHeight - 32;
            setMoreBelow(!intersecting && !nearBottom);
        }
        const observer = new IntersectionObserver(
            ([entry]) => {
                intersecting = entry.isIntersecting;
                refresh();
            },
            { root: null, rootMargin: '0px 0px -88px 0px', threshold: 0 },
        );
        observer.observe(el);
        window.addEventListener('scroll', refresh, { passive: true });
        refresh();
        return () => {
            observer.disconnect();
            window.removeEventListener('scroll', refresh);
        };
    }, [needsManualNext, index, question?.id, selected.length, showFollowUp]);

    if (!session.person) return <Navigate to="/matricula" replace />;
    if (completed) {
        return (
            <KioskLayout>
                <AfterStepScreen
                    justFinished="generalHealth"
                    title="Saúde geral concluída"
                    description="Suas respostas foram registradas."
                />
            </KioskLayout>
        );
    }
    if (!question) return <Navigate to="/menu" replace />;

    function finish(nextAnswers: AnswerMap, nextDetails: DetailMap) {
        const score = scoreQuestionnaire(def, nextAnswers, nextDetails);
        setGeneralHealth(score);
        const personId = session.person?.id;
        if (personId) {
            void saveFormSubmission({
                person_id: personId,
                module: 'health',
                status: 'completed',
                payload: healthKioskPayload(def, score),
                visit_id: session.visitId,
            }).catch(() => undefined);
        }
        setCompleted(true);
    }

    function goNext(nextAnswers: AnswerMap, nextDetails: DetailMap = details) {
        if (index >= total - 1) {
            finish(nextAnswers, nextDetails);
            return;
        }
        setIndex((value) => value + 1);
    }

    function clearDetail(questionId: string, next: DetailMap): DetailMap {
        if (!(questionId in next)) return next;
        const rest = { ...next };
        delete rest[questionId];
        return rest;
    }

    function selectSingle(optionId: string) {
        const nextAnswers = { ...answers, [question.id]: [optionId] };
        const wantsFollowUp = question.followUpWhenOptionId === optionId;
        const nextDetails = wantsFollowUp ? details : clearDetail(question.id, details);
        setAnswers(nextAnswers);
        setDetails(nextDetails);
        setFlashId(optionId);
        if (wantsFollowUp) return;
        window.setTimeout(() => goNext(nextAnswers, nextDetails), 280);
    }

    function toggleMultiple(optionId: string) {
        const exclusive = question.exclusiveOptionId;
        if (exclusive && optionId === exclusive) {
            const nextAnswers = { ...answers, [question.id]: [exclusive] };
            const nextDetails = clearDetail(question.id, details);
            setAnswers(nextAnswers);
            setDetails(nextDetails);
            setFlashId(optionId);
            window.setTimeout(() => goNext(nextAnswers, nextDetails), 280);
            return;
        }

        const current = (answers[question.id] ?? []).filter((id) => id !== exclusive);
        const nextSelected = current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId];
        const nextAnswers = { ...answers, [question.id]: nextSelected };
        const followUpId = question.followUpOptionId;
        const nextDetails = followUpId && !nextSelected.includes(followUpId)
            ? clearDetail(question.id, details)
            : details;
        setAnswers(nextAnswers);
        setDetails(nextDetails);
    }

    function handleAdvance() {
        if (!canAdvance) return;
        goNext(answers, details);
    }

    function handleBack() {
        if (index === 0) {
            navigate('/menu');
            return;
        }
        setIndex((value) => value - 1);
    }

    const optionScores = question.options.map((item) => item.score);

    return (
        <KioskLayout>
            <div className={`kiosk-quiz${needsManualNext ? ' has-advance' : ''}`}>
                <div className="kiosk-quiz-meta">
                    <div className="kiosk-quiz-meta-main">
                        <div className="kiosk-quiz-progress-label">
                            Pergunta {index + 1} de {total}
                        </div>
                        <div className="kiosk-progress-track" aria-hidden>
                            <div className="kiosk-progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                    <div className="kiosk-quiz-eta">{minutesLabel}</div>
                </div>

                <KioskQuizHeading category={def.category} onBack={handleBack} />
                <h1 className="kiosk-quiz-question">{question.text}</h1>
                {isMultiple ? (
                    <p className="kiosk-quiz-hint">Pode marcar mais de uma opção. Depois toque em Avançar.</p>
                ) : null}

                <div className="kiosk-option-list">
                    {question.options.map((option) => {
                        const active = selected.includes(option.id) || flashId === option.id;
                        return (
                            <button
                                key={option.id}
                                type="button"
                                className={`kiosk-option${isMultiple ? ' is-checkable' : ''}${active ? ' selected' : ''}${optionScaleClass(option.score, optionScores, true)}`}
                                aria-pressed={isMultiple ? active : undefined}
                                onClick={() => {
                                    if (question.kind === 'single') selectSingle(option.id);
                                    else toggleMultiple(option.id);
                                }}
                            >
                                <KioskOptionContent
                                    label={option.label}
                                    score={option.score}
                                    scores={optionScores}
                                    higherIsBetter
                                    checkable={isMultiple}
                                    checked={active}
                                />
                            </button>
                        );
                    })}
                </div>

                {showFollowUp ? (
                    <label className="kiosk-field kiosk-quiz-followup">
                        <span>{question.followUpPrompt ?? 'Detalhe'}</span>
                        <input
                            className="kiosk-input"
                            value={detail}
                            onChange={(event) => {
                                setDetails({ ...details, [question.id]: event.target.value });
                            }}
                            placeholder={question.followUpPlaceholder}
                            autoFocus
                        />
                    </label>
                ) : null}

                <div ref={listEndRef} className="kiosk-quiz-end" />

                {needsManualNext && moreBelow ? (
                    <button
                        type="button"
                        className="kiosk-scroll-hint"
                        aria-label="Há mais opções abaixo. Role a tela."
                        onClick={() => listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
                    >
                        <ChevronDown size={26} strokeWidth={2.4} aria-hidden />
                    </button>
                ) : null}

                {needsManualNext ? (
                    <div className="kiosk-quiz-advance">
                        <button
                            type="button"
                            className="kiosk-btn kiosk-btn-primary"
                            disabled={!canAdvance}
                            onClick={handleAdvance}
                        >
                            Avançar
                        </button>
                    </div>
                ) : null}
            </div>
        </KioskLayout>
    );
}
