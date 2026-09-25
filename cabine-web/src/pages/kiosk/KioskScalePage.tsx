import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { apiErrorMessage, fetchScales, pickPreferredScale, saveMeasurement, WS_PATHS } from '../../api';
import { AfterStepScreen } from '../../components/AfterStepScreen';
import { BiaGuideIllustration } from '../../components/BiaGuideIllustration';
import { KioskBackButton } from '../../components/KioskBackButton';
import { useDeviceSocket } from '../../hooks/useDeviceSocket';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { hasBiaImpedances, type MeasurementPayload, type ScaleLiveMessage, type ScaleLiveReading } from '../../types/measurement';
import type { Scale } from '../../types/scale';
import { friendlyScaleStatus } from '../../utils/friendlyScaleStatus';

const GUIDE = [
    {
        id: 'step_on',
        title: 'Suba na balança',
        detail: 'Pés descalços no centro. Segure a barra.',
    },
    {
        id: 'hold_bar',
        title: 'Segure a barra',
        detail: 'Duas mãos na barra. Fique parado.',
    },
    {
        id: 'extend_bar',
        title: 'Braços à frente',
        detail: 'Estenda os braços sem encostar a barra no corpo.',
    },
    {
        id: 'measuring',
        title: 'Medindo',
        detail: 'Respire normalmente. Só mais alguns segundos.',
    },
    {
        id: 'done',
        title: 'Medição concluída',
        detail: 'Pode descer da balança.',
    },
] as const;

function stepIndex(step: string) {
    const mapped = step === 'wait_stable' ? 'step_on' : step;
    const idx = GUIDE.findIndex((item) => item.id === mapped);
    return idx >= 0 ? idx : 0;
}

export function KioskScalePage() {
    const navigate = useNavigate();
    const { session, setLastMeasurement } = useKiosk();
    const person = session.person;

    const [scale, setScale] = useState<Scale | null>(null);
    const [status, setStatus] = useState('Preparando a balança...');
    const [guideStep, setGuideStep] = useState('step_on');
    const [currentWeight, setCurrentWeight] = useState<number | null>(null);
    const [view, setView] = useState<'ready' | 'live' | 'done'>('ready');
    const [error, setError] = useState('');

    const finishedRef = useRef(false);
    const savingRef = useRef(false);
    const persistedRef = useRef(false);
    const lastReadingRef = useRef<ScaleLiveReading | null>(null);

    const persistAndContinue = useCallback(async (reading: ScaleLiveReading) => {
        if (!person || reading.weight_kg <= 0) return;
        if (persistedRef.current) return;
        const hasBia = hasBiaImpedances(reading.impedances_ohm);
        if (savingRef.current && !hasBia) return;
        savingRef.current = true;
        const payload: MeasurementPayload = {
            person_id: person.id,
            scale_id: scale?.id ?? null,
            scale_name: reading.scale_name || scale?.name || 'Balança',
            adapter: scale?.adapter || 'ble_rm_rd2504a',
            weight_kg: reading.weight_kg,
            height_cm: person.height_cm,
            age: person.age,
            birth_date: person.birth_date,
            sex: person.sex,
            people_type: person.people_type || 'normal',
            expected_weight_kg: reading.weight_kg,
            stable: reading.stable,
            complete: Boolean(reading.complete || hasBia),
            impedances_ohm: reading.impedances_ohm ?? null,
            segments: reading.segments ?? null,
            metrics: reading.metrics ?? null,
            visit_id: session.visitId,
        };
        try {
            const data = await saveMeasurement(payload);
            persistedRef.current = true;
            setLastMeasurement(data);
            setView('done');
            setGuideStep('done');
        } catch (err) {
            setError(apiErrorMessage(err, 'Não foi possível salvar a medição.'));
            savingRef.current = false;
        }
    }, [person, scale, session.visitId, setLastMeasurement]);

    const persistRef = useRef(persistAndContinue);
    persistRef.current = persistAndContinue;

    const completeReading = (reading: ScaleLiveReading) => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        setCurrentWeight(reading.weight_kg);
        setGuideStep('done');
        setStatus('Medição concluída. Desça da balança.');
        setView('done');
        close();
        void persistRef.current({ ...reading, complete: true });
    };

    const { connect, close } = useDeviceSocket<ScaleLiveMessage>(WS_PATHS.scale, {
        onOpen: (socket) => {
            setStatus('Balança pronta. Pode subir.');
            if (!person) return;
            socket.send(JSON.stringify({
                type: 'PROFILE',
                apply: true,
                person_id: person.id,
                height_cm: person.height_cm,
                age: person.age,
                sex: person.sex,
                birth_date: person.birth_date || undefined,
                people_type: person.people_type || 'normal',
                expected_weight_kg: person.expected_weight_kg ?? undefined,
                display_name: person.name,
                visit_id: session.visitId ?? undefined,
            }));
        },
        onError: () => setStatus('Não foi possível conectar à balança.'),
        onDrop: () => setStatus((prev) => (finishedRef.current ? prev : 'Reconectando…')),
        onMessage: (data) => {
            if (finishedRef.current) return;

            if (data.type === 'STATUS' && data.msg) {
                const next = friendlyScaleStatus(data.msg);
                if (next) setStatus(next);
            } else if (data.type === 'STEP' && data.step) {
                if (data.reset) {
                    const last = lastReadingRef.current;
                    const lastBia = Boolean(last && (last.complete || hasBiaImpedances(last.impedances_ohm)));
                    if (last && last.weight_kg >= 10 && lastBia) {
                        completeReading(last);
                        return;
                    }
                    setCurrentWeight(null);
                    setGuideStep(data.step);
                    setView('ready');
                    if (data.msg) {
                        const next = friendlyScaleStatus(data.msg);
                        if (next) setStatus(next);
                    }
                } else {
                    setGuideStep(data.step);
                    if (data.msg) {
                        const next = friendlyScaleStatus(data.msg);
                        if (next) setStatus(next);
                    }
                }
            } else if (data.type === 'WEIGHT' && data.weight_kg !== undefined) {
                setView('live');
                lastReadingRef.current = {
                    weight_kg: data.weight_kg,
                    stable: Boolean(data.stable),
                    complete: Boolean(data.complete),
                    metrics: data.metrics ?? null,
                    impedances_ohm: data.impedances_ohm,
                    segments: data.segments,
                    scale_name: data.scale_name,
                };
                setCurrentWeight(data.weight_kg);
                if (data.complete || hasBiaImpedances(data.impedances_ohm)) {
                    completeReading(lastReadingRef.current);
                } else {
                    setStatus(data.stable ? 'Peso confirmado' : 'Medindo…');
                }
            }
        },
    });

    useEffect(() => {
        fetchScales()
            .then((data) => {
                const preferred = pickPreferredScale(data);
                setScale(preferred);
                if (!preferred) setError('Nenhuma balança cadastrada.');
            })
            .catch(() => setError('Não foi possível carregar as balanças.'));
    }, []);

    useEffect(() => {
        if (!person || !scale || finishedRef.current) return;

        savingRef.current = false;
        persistedRef.current = false;
        lastReadingRef.current = null;
        setCurrentWeight(null);
        setGuideStep('step_on');
        setView('ready');
        setStatus('Preparando a balança...');

        const params = new URLSearchParams({
            scale_id: scale.id,
            height_cm: String(person.height_cm),
            age: String(person.age),
            sex: person.sex,
            people_type: person.people_type || 'normal',
            person_id: person.id,
            display_name: person.name,
        });
        if (person.birth_date) params.set('birth_date', person.birth_date);
        if (person.expected_weight_kg != null) {
            params.set('expected_weight_kg', String(person.expected_weight_kg));
        }
        if (session.visitId) params.set('visit_id', session.visitId);

        connect(params, true);
        return close;
    }, [person, scale, session.visitId, connect, close]);

    if (!person) return <Navigate to="/matricula" replace />;

    const active = stepIndex(guideStep);
    const current = GUIDE[active] ?? GUIDE[0];

    if (view === 'done') {
        return (
            <KioskLayout>
                {error ? <p className="kiosk-error">{error}</p> : null}
                <AfterStepScreen
                    justFinished="bia"
                    title="Medição concluída"
                    description="Seu peso e bioimpedância foram registrados."
                    hint="Desça da balança para continuar."
                />
            </KioskLayout>
        );
    }

    return (
        <KioskLayout>
            <div className="kiosk-bia">
                <p className="kiosk-step-label">3 · Passo</p>
                <h1 className="kiosk-title">{current.title}</h1>
                <p className="kiosk-live-status" role="status" aria-live="polite">
                    {error || status}
                </p>

                <BiaGuideIllustration step={guideStep} />

                <p className="kiosk-oxi-hint">{current.detail}</p>

                <div className="kiosk-weight-display">
                    {currentWeight != null ? currentWeight.toFixed(1) : '--.-'}
                    <span> kg</span>
                </div>

                <div className="kiosk-dots" aria-hidden>
                    {GUIDE.slice(0, 4).map((item, index) => (
                        <span
                            key={item.id}
                            className={
                                index < active
                                    ? 'done'
                                    : index === active
                                        ? 'active'
                                        : ''
                            }
                        />
                    ))}
                </div>

                <KioskBackButton onClick={() => navigate('/menu')}>Voltar ao menu</KioskBackButton>
            </div>
        </KioskLayout>
    );
}
