import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { api, apiErrorMessage, deviceSocket } from '../../api';
import { BiaGuideIllustration } from '../../components/BiaGuideIllustration';
import { AfterStepScreen } from '../../components/AfterStepScreen';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { hasBiaImpedances, type MeasurementPayload, type MeasurementRecord, type ScaleLiveMessage, type ScaleMetrics, type Segmento } from '../../types/measurement';
import type { Scale } from '../../types/scale';

const GUIDE = [
    {
        id: 'step_on',
        title: 'Suba na balança',
        detail: 'Pés descalços nos eletrodos. Fique no centro da plataforma.',
    },
    {
        id: 'hold_bar',
        title: 'Segure a barra',
        detail: 'Pegue a barra com as duas mãos e mantenha-se parado.',
    },
    {
        id: 'extend_bar',
        title: 'Braços a 40° do corpo',
        detail: 'Estenda os braços à frente, sem encostar a barra no tronco.',
    },
    {
        id: 'measuring',
        title: 'Medindo composição',
        detail: 'Respire normalmente. A leitura leva alguns segundos.',
    },
    {
        id: 'done',
        title: 'Bioimpedância concluída',
        detail: 'Medição salva. Desça da balança para seguir.',
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

    const wsRef = useRef<WebSocket | null>(null);
    const finishedRef = useRef(false);
    const savingRef = useRef(false);
    const persistedRef = useRef(false);
    const lastReadingRef = useRef<{
        peso_kg: number;
        estavel: boolean;
        completo: boolean;
        metricas?: ScaleMetrics | null;
        impedancias_ohm?: number[];
        segmentos?: Segmento[];
        balanca_nome?: string;
    } | null>(null);

    const persistAndContinue = useCallback(async (reading: {
        peso_kg: number;
        estavel: boolean;
        completo: boolean;
        metricas?: ScaleMetrics | null;
        impedancias_ohm?: number[];
        segmentos?: Segmento[];
        balanca_nome?: string;
    }) => {
        if (!person || reading.peso_kg <= 0) return;
        if (persistedRef.current) return;
        const hasBia = hasBiaImpedances(reading.impedancias_ohm);
        if (savingRef.current && !hasBia) return;
        savingRef.current = true;
        const payload: MeasurementPayload = {
            person_id: person.id,
            scale_id: scale?.id ?? null,
            scale_name: reading.balanca_nome || scale?.name || 'Balança',
            adapter: scale?.adapter || 'ble_icomon',
            peso_kg: reading.peso_kg,
            height_cm: person.height_cm,
            age: person.age,
            birth_date: person.birth_date,
            sex: person.sex,
            people_type: person.people_type || 'normal',
            expected_weight_kg: reading.peso_kg,
            estavel: reading.estavel,
            completo: Boolean(reading.completo || hasBia),
            impedancias_ohm: reading.impedancias_ohm ?? null,
            segmentos: reading.segmentos ?? null,
            metricas: reading.metricas ?? null,
            visit_id: session.visitId,
        };
        try {
            const { data } = await api.post<MeasurementRecord>(
                '/measurements',
                JSON.parse(JSON.stringify(payload)),
            );
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

    const stopScaleStream = useCallback(() => {
        finishedRef.current = true;
        const ws = wsRef.current;
        wsRef.current = null;
        if (!ws) return;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
        } catch {
            /* já fechado */
        }
    }, []);

    useEffect(() => {
        api.get<Scale[]>('/scales')
            .then(({ data }) => {
                const preferred = data.find((item) => item.is_default && item.is_active)
                    ?? data.find((item) => item.is_active)
                    ?? data[0]
                    ?? null;
                setScale(preferred);
                if (!preferred) setError('Nenhuma balança cadastrada.');
            })
            .catch(() => setError('Não foi possível carregar as balanças.'));
    }, []);

    useEffect(() => {
        if (!person || !scale || finishedRef.current) return;

        finishedRef.current = false;
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

        const ws = deviceSocket('/ws/scale', params);
        wsRef.current = ws;

        const completeReading = (reading: {
            peso_kg: number;
            estavel: boolean;
            completo: boolean;
            metricas?: ScaleMetrics | null;
            impedancias_ohm?: number[];
            segmentos?: Segmento[];
            balanca_nome?: string;
        }) => {
            if (finishedRef.current) return;
            finishedRef.current = true;
            setCurrentWeight(reading.peso_kg);
            setGuideStep('done');
            setStatus('Avaliação concluída. Desça da balança.');
            setView('done');
            stopScaleStream();
            void persistRef.current({ ...reading, completo: true });
        };

        ws.onopen = () => {
            setStatus('Balança pronta. Pode subir.');
            ws.send(JSON.stringify({
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
        };
        ws.onerror = () => setStatus('Não foi possível falar com a balança.');
        ws.onclose = () => setStatus((prev) => (finishedRef.current ? prev : 'Desconectado'));

        ws.onmessage = (event) => {
            if (finishedRef.current) return;
            const data: ScaleLiveMessage = JSON.parse(event.data);

            if (data.type === 'STATUS' && data.msg) {
                setStatus(data.msg);
            } else if (data.type === 'STEP' && data.step) {
                if (data.reset) {
                    const last = lastReadingRef.current;
                    const lastBia = Boolean(last && (last.completo || hasBiaImpedances(last.impedancias_ohm)));
                    if (last && last.peso_kg >= 10 && lastBia) {
                        completeReading(last);
                        return;
                    }
                    setCurrentWeight(null);
                    setGuideStep(data.step);
                    setView('ready');
                } else {
                    setGuideStep(data.step);
                    if (data.msg) setStatus(data.msg);
                }
            } else if (data.type === 'PESO_RECEBIDO' && data.peso_kg !== undefined) {
                setView('live');
                lastReadingRef.current = {
                    peso_kg: data.peso_kg,
                    estavel: Boolean(data.estavel),
                    completo: Boolean(data.completo),
                    metricas: data.metricas ?? null,
                    impedancias_ohm: data.impedancias_ohm,
                    segmentos: data.segmentos,
                    balanca_nome: data.balanca_nome,
                };
                setCurrentWeight(data.peso_kg);
                if (data.completo || hasBiaImpedances(data.impedancias_ohm)) {
                    completeReading(lastReadingRef.current);
                } else {
                    setStatus(data.estavel ? 'Peso estável' : 'Avaliando...');
                }
            }
        };

        return () => {
            if (wsRef.current === ws) wsRef.current = null;
            ws.onmessage = null;
            ws.onerror = null;
            ws.onclose = null;
            ws.close();
        };
    }, [person, scale, session.visitId, stopScaleStream]);

    if (!person) return <Navigate to="/matricula" replace />;

    const active = stepIndex(guideStep);
    const current = GUIDE[active] ?? GUIDE[0];

    if (view === 'done') {
        return (
            <KioskLayout>
                {error ? <p className="kiosk-error">{error}</p> : null}
                <AfterStepScreen
                    justFinished="bia"
                    title="Bioimpedância concluída"
                    description="Sua medição foi registrada."
                    hint="Desça da balança agora. Se ficar no prato, ela continua enviando peso e a leitura pode recomeçar."
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

                <button type="button" className="kiosk-back" onClick={() => navigate('/menu')}>
                    ← Voltar ao menu
                </button>
            </div>
        </KioskLayout>
    );
}
