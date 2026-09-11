import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import {
    scoreQuestionnaire,
    type AnswerMap,
    type QuestionnaireDef,
} from '../../data/questionnaires';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';

type Props = {
    def: QuestionnaireDef;
    mode: 'saude_geral' | 'saude_mental';
};

export function QuestionnairePage({ def, mode }: Props) {
    const { session, setSaudeGeral, setSaudeMental } = useKiosk();
    const navigate = useNavigate();
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState<AnswerMap>({});
    const [flashId, setFlashId] = useState<string | null>(null);

    const question = def.questions[index];
    const total = def.questions.length;
    const progress = ((index + 1) / total) * 100;
    const minutesLabel = def.estimatedSeconds < 60
        ? `~${def.estimatedSeconds}s`
        : `~${Math.max(1, Math.round(def.estimatedSeconds / 60))} min`;
    const selected = answers[question?.id ?? ''] ?? [];

    const canAdvanceMultiple = useMemo(
        () => question?.kind === 'multiple' && selected.length > 0,
        [question, selected],
    );

    useEffect(() => {
        setFlashId(null);
    }, [index]);

    if (!session.person) return <Navigate to="/matricula" replace />;
    if (!question) return <Navigate to="/menu" replace />;

    function goNext(nextAnswers: AnswerMap) {
        if (index >= total - 1) {
            const score = scoreQuestionnaire(def, nextAnswers);
            if (mode === 'saude_geral') setSaudeGeral(score);
            else setSaudeMental(score);
            navigate('/conclusao', { replace: true });
            return;
        }
        setIndex((value) => value + 1);
    }

    function selectSingle(optionId: string) {
        if (!question) return;
        const next = { ...answers, [question.id]: [optionId] };
        setAnswers(next);
        setFlashId(optionId);
        window.setTimeout(() => goNext(next), 280);
    }

    function toggleMultiple(optionId: string) {
        if (!question) return;
        const current = answers[question.id] ?? [];
        const nextSelected = current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId];
        setAnswers({ ...answers, [question.id]: nextSelected });
    }

    function handleBack() {
        if (index === 0) {
            navigate('/menu');
            return;
        }
        setIndex((value) => value - 1);
    }

    return (
        <KioskLayout>
            <div className="kiosk-quiz">
                <div className="kiosk-quiz-meta">
                    <div>
                        <div className="kiosk-quiz-progress-label">
                            Pergunta {index + 1} de {total}
                        </div>
                        <div className="kiosk-progress-track" aria-hidden>
                            <div className="kiosk-progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                    <div className="kiosk-quiz-eta">{minutesLabel}</div>
                </div>

                <div className="kiosk-quiz-category">{def.category}</div>
                <h1 className="kiosk-quiz-question">{question.text}</h1>

                <div className="kiosk-option-list">
                    {question.options.map((option) => {
                        const active = selected.includes(option.id) || flashId === option.id;
                        return (
                            <button
                                key={option.id}
                                type="button"
                                className={`kiosk-option${active ? ' selected' : ''}`}
                                onClick={() => {
                                    if (question.kind === 'single') selectSingle(option.id);
                                    else toggleMultiple(option.id);
                                }}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>

                {question.kind === 'multiple' ? (
                    <button
                        type="button"
                        className="kiosk-btn kiosk-btn-primary"
                        disabled={!canAdvanceMultiple}
                        onClick={() => goNext(answers)}
                    >
                        Avançar
                    </button>
                ) : null}

                <button type="button" className="kiosk-back" onClick={handleBack}>
                    ← Voltar
                </button>
            </div>
        </KioskLayout>
    );
}
