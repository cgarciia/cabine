import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { api, apiErrorMessage, wsBaseUrl } from '../../api';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import type { MeasurementPayload, MeasurementRecord, ScaleMetrics, Segmento } from '../../types/measurement';
import type { Scale } from '../../types/scale';

interface ScalePayload {
    type: string;
    step?: string;
    reset?: boolean;
    balanca_nome?: string;
    peso_kg?: number;
    msg?: string;
    estavel?: boolean;
    completo?: boolean;
    metricas?: ScaleMetrics;
    impedancias_ohm?: number[];
    segmentos?: Segmento[];
}

const GUIDE = [
    { id: 'step_on', title: 'Suba na balança', detail: 'Pés descalços no centro. Mãos nos eletrodos da barra.' },
    { id: 'hold_bar', title: 'Fique parado', detail: 'Mantenha-se estável até o peso confirmar.' },
    { id: 'extend_bar', title: 'Braços à frente', detail: 'Estique os braços sem encostar a barra no corpo.' },
    { id: 'measuring', title: 'Medindo', detail: 'Respire normalmente. A leitura leva alguns segundos.' },
    { id: 'done', title: 'Pronto', detail: 'Medição concluída.' },
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
        if (!person || reading.peso_kg <= 0 || savingRef.current) return;
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
            completo: reading.completo,
            impedancias_ohm: reading.impedancias_ohm ?? null,
            segmentos: reading.segmentos ?? null,
            metricas: reading.metricas ?? null,
        };
        try {
            const { data } = await api.post<MeasurementRecord>(
                '/measurements',
                JSON.parse(JSON.stringify(payload)),
            );
            setLastMeasurement(data);
            setView('done');
            window.setTimeout(() => navigate('/oximetro', { replace: true }), 900);
        } catch (err) {
            setError(apiErrorMessage(err, 'Não foi possível salvar a medição.'));
            savingRef.current = false;
        }
    }, [navigate, person, scale, setLastMeasurement]);

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
        if (!person || !scale) return;

        finishedRef.current = false;
        savingRef.current = false;
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

        const ws = new WebSocket(`${wsBaseUrl()}/ws/scale?${params.toString()}`);
        wsRef.current = ws;

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
            }));
        };
        ws.onerror = () => setStatus('Não foi possível falar com a balança.');
        ws.onclose = () => setStatus((prev) => (finishedRef.current ? prev : 'Desconectado'));

        ws.onmessage = (event) => {
            const data: ScalePayload = JSON.parse(event.data);
            if (finishedRef.current) return;

            if (data.type === 'STATUS' && data.msg) {
                setStatus(data.msg);
            } else if (data.type === 'STEP' && data.step) {
                if (data.reset) {
                    const last = lastReadingRef.current;
                    if (last && last.peso_kg >= 10) {
                        finishedRef.current = true;
                        setCurrentWeight(last.peso_kg);
                        setGuideStep('done');
                        setStatus('Avaliação concluída');
                        void persistAndContinue(last);
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
                if (data.completo) {
                    finishedRef.current = true;
                    setGuideStep('done');
                    setStatus('Avaliação concluída');
                    void persistAndContinue(lastReadingRef.current);
                } else {
                    setStatus(data.estavel ? 'Peso estável' : 'Avaliando...');
                }
            }
        };

        return () => {
            ws.close();
        };
    }, [person, scale, persistAndContinue]);

    if (!person) return <Navigate to="/matricula" replace />;

    const active = stepIndex(guideStep);
    const current = GUIDE[active] ?? GUIDE[0];

    return (
        <KioskLayout>
            <div className="kiosk-bia">
                <p className="kiosk-step-label">1 · Passo</p>
                <h1 className="kiosk-title">{current.title}</h1>
                <p className="kiosk-subtitle">{current.detail}</p>

                <div className="kiosk-scale-art" aria-hidden>
                    <svg viewBox="0 0 240 220" width="240" height="220">
                        <ellipse cx="120" cy="200" rx="80" ry="12" fill="#e2e8f0" />
                        <rect x="50" y="160" width="140" height="28" rx="10" fill="#cbd5e1" className="kiosk-scale-base" />
                        <rect x="112" y="70" width="16" height="95" rx="6" fill="#94a3b8" />
                        <rect x="70" y="55" width="100" height="18" rx="8" fill="#0f766e" className="kiosk-scale-bar" />
                        <circle cx="120" cy="120" r="28" fill="#fecaca" className="kiosk-scale-person" />
                        <rect x="105" y="145" width="30" height="40" rx="10" fill="#fda4af" />
                    </svg>
                </div>

                <div className="kiosk-weight-display">
                    {currentWeight != null ? currentWeight.toFixed(1) : '--.-'}
                    <span> kg</span>
                </div>
                <p className="kiosk-muted">{error || status}</p>

                <div className="kiosk-dots" aria-hidden>
                    {GUIDE.slice(0, 4).map((item, index) => (
                        <span
                            key={item.id}
                            className={
                                index < active ? 'done' : index === active && view !== 'ready' ? 'active' : ''
                            }
                        />
                    ))}
                </div>

                {view === 'done' ? (
                    <p className="kiosk-subtitle">Medição salva. Seguindo para o próximo passo…</p>
                ) : null}

                <button type="button" className="kiosk-back" onClick={() => navigate('/menu')}>
                    ← Voltar ao menu
                </button>
            </div>
        </KioskLayout>
    );
}
