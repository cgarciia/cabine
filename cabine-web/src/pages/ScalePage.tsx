import { useEffect, useState, useRef, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api';
import { AppLayout } from '../components/AppLayout';
import type { Scale } from '../types/scale';
import {
    calculateBodyComposition,
    type BodyCompositionResult,
    type Sexo,
} from '../utils/bodyComposition';

interface ScalePayload {
    type: string;
    balanca_nome?: string;
    peso_kg?: number;
    timestamp?: string;
    msg?: string;
}

type Step = 'dados' | 'pesagem';

interface PatientData {
    aniversario: string;
    altura: string;
    sexo: Sexo | '';
}

const STABLE_MS = 2000;

const fieldStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    marginTop: '6px',
    padding: '10px 12px',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    fontSize: '1rem',
    color: '#0F172A',
    background: '#f8fafc',
    boxSizing: 'border-box',
};

const labelStyle: CSSProperties = {
    display: 'block',
    marginBottom: '1rem',
    textAlign: 'left',
    color: '#475569',
    fontSize: '0.875rem',
    width: '100%',
};

const emptyPatient: PatientData = {
    aniversario: '',
    altura: '',
    sexo: '',
};

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '12px 14px',
            textAlign: 'left',
        }}>
            <div style={{ color: '#64748B', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {label}
            </div>
            <div style={{ color: '#0F172A', fontSize: '1.15rem', fontWeight: 700, marginTop: '4px' }}>
                {value}
            </div>
            {hint ? (
                <div style={{ color: '#94A3B8', fontSize: '0.75rem', marginTop: '2px' }}>{hint}</div>
            ) : null}
        </div>
    );
}

export const ScalePage = () => {
    const [step, setStep] = useState<Step>('dados');
    const [patient, setPatient] = useState<PatientData>(emptyPatient);
    const [formError, setFormError] = useState('');

    const [scales, setScales] = useState<Scale[]>([]);
    const [selectedId, setSelectedId] = useState<string>('');
    const [currentWeight, setCurrentWeight] = useState<number | null>(null);
    const [scaleName, setScaleName] = useState<string>('Buscando dispositivo...');
    const [lastUpdate, setLastUpdate] = useState<string>('--:--:--');
    const [status, setStatus] = useState('Desconectado');
    const [loadError, setLoadError] = useState('');
    const [captureComplete, setCaptureComplete] = useState(false);
    const [composition, setComposition] = useState<BodyCompositionResult | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const patientRef = useRef(patient);

    useEffect(() => {
        patientRef.current = patient;
    }, [patient]);

    useEffect(() => {
        api.get<Scale[]>('/scales').then(({ data }) => {
            setLoadError('');
            setScales(data);
            const preferred = data.find((item) => item.is_default && item.is_active)
                ?? data.find((item) => item.is_active)
                ?? data[0];
            if (preferred) setSelectedId(preferred.id);
        }).catch(() => {
            setLoadError('Não foi possível carregar as balanças cadastradas.');
        });
    }, []);

    useEffect(() => {
        if (step !== 'pesagem' || !selectedId || captureComplete) return;

        const selected = scales.find((item) => item.id === selectedId);
        if (selected) setScaleName(selected.name);

        setCurrentWeight(null);
        setLastUpdate('--:--:--');
        setStatus('Conectando ao serviço...');
        setComposition(null);

        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const wsUrl = baseUrl.replace('http', 'ws');
        const ws = new WebSocket(`${wsUrl}/ws/scale?scale_id=${selectedId}`);
        wsRef.current = ws;

        ws.onopen = () => setStatus('Conectando ao serviço...');
        ws.onclose = () => {
            setStatus((current) => (
                current === 'Captura concluída' ? current : 'Desconectado do servidor'
            ));
        };

        ws.onmessage = (event) => {
            const data: ScalePayload = JSON.parse(event.data);

            if (data.type === 'STATUS' && data.msg) {
                setStatus(data.msg);
            } else if (data.type === 'PESO_RECEBIDO' && data.peso_kg !== undefined) {
                setStatus('Monitoramento em tempo real');
                setCurrentWeight(data.peso_kg);
                if (data.balanca_nome) setScaleName(data.balanca_nome);
                if (data.timestamp) setLastUpdate(data.timestamp);

                if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
                const peso = data.peso_kg;
                stableTimerRef.current = setTimeout(() => {
                    const dados = patientRef.current;
                    if (!dados.sexo || !dados.aniversario) return;
                    const alturaCm = Number(dados.altura.replace(',', '.'));
                    const result = calculateBodyComposition({
                        pesoKg: peso,
                        alturaCm,
                        aniversario: dados.aniversario,
                        sexo: dados.sexo,
                    });
                    if (!result) return;

                    setComposition(result);
                    setCaptureComplete(true);
                    setStatus('Captura concluída');
                    ws.close();
                }, STABLE_MS);
            }
        };

        return () => {
            if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
            ws.close();
            wsRef.current = null;
        };
    }, [step, selectedId, scales, captureComplete]);

    function goToScale(event: FormEvent) {
        event.preventDefault();
        setFormError('');

        if (!patient.aniversario) {
            setFormError('Informe a data de aniversário.');
            return;
        }
        const altura = Number(patient.altura.replace(',', '.'));
        if (!patient.altura || Number.isNaN(altura) || altura <= 0) {
            setFormError('Informe uma altura válida em centímetros.');
            return;
        }
        if (!patient.sexo) {
            setFormError('Selecione o sexo.');
            return;
        }
        if (loadError || scales.length === 0 || !selectedId) {
            setFormError(loadError || 'Nenhuma balança cadastrada. Cadastre uma em Cadastro.');
            return;
        }

        setCaptureComplete(false);
        setComposition(null);
        setStep('pesagem');
    }

    function backToDados() {
        if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
        setStep('dados');
        setCurrentWeight(null);
        setLastUpdate('--:--:--');
        setStatus('Desconectado');
        setScaleName('Buscando dispositivo...');
        setCaptureComplete(false);
        setComposition(null);
    }

    function novaCaptura() {
        if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
        setCaptureComplete(false);
        setComposition(null);
        setCurrentWeight(null);
        setLastUpdate('--:--:--');
        setStatus('Conectando ao serviço...');
    }

    const isLive = status.includes('tempo real');
    const isDone = captureComplete || status === 'Captura concluída';
    const isError = !isDone && (status.includes('Desconectado') || status.includes('Erro') || status.includes('Falha') || status.includes('Não foi possível'));
    const statusColor = isDone ? '#10B981' : isLive ? '#10B981' : isError ? '#EF4444' : '#F59E0B';

    return (
        <AppLayout>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem 2rem 3rem',
            }}>
                <style>
                    {`
                    @keyframes pulse-ring {
                        0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                        70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
                        100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                    }
                    .status-dot.live {
                        animation: pulse-ring 2s infinite;
                    }
                    `}
                </style>

                <main style={{
                    background: '#ffffff',
                    borderRadius: '24px',
                    padding: '3rem 4rem',
                    width: '100%',
                    maxWidth: composition ? '640px' : '540px',
                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '6px',
                        background: step === 'pesagem'
                            ? `linear-gradient(90deg, ${statusColor} 0%, #3B82F6 100%)`
                            : 'linear-gradient(90deg, #3B82F6 0%, #60A5FA 100%)',
                        transition: 'background 0.5s ease',
                    }} />

                    {step === 'dados' ? (
                        <>
                            <header style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.75rem' }}>
                                <div style={{
                                    background: '#eff6ff',
                                    padding: '10px',
                                    borderRadius: '12px',
                                    color: '#3B82F6',
                                    display: 'flex',
                                }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                    </svg>
                                </div>
                                <div>
                                    <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#1E293B', fontWeight: '700' }}>Dados do paciente</h1>
                                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748B' }}>Preencha antes de iniciar a pesagem</p>
                                </div>
                            </header>

                            <form onSubmit={goToScale} style={{ width: '100%' }}>
                                <label style={labelStyle}>
                                    Aniversário
                                    <input
                                        type="date"
                                        value={patient.aniversario}
                                        onChange={(event) => setPatient({ ...patient, aniversario: event.target.value })}
                                        style={fieldStyle}
                                        required
                                    />
                                </label>

                                <label style={labelStyle}>
                                    Altura (cm)
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        min="1"
                                        step="0.1"
                                        placeholder="Ex.: 170"
                                        value={patient.altura}
                                        onChange={(event) => setPatient({ ...patient, altura: event.target.value })}
                                        style={fieldStyle}
                                        required
                                    />
                                </label>

                                <fieldset style={{
                                    border: 0,
                                    margin: '0 0 1.25rem',
                                    padding: 0,
                                    width: '100%',
                                    textAlign: 'left',
                                }}>
                                    <legend style={{ color: '#475569', fontSize: '0.875rem', marginBottom: '8px' }}>
                                        Sexo
                                    </legend>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {([
                                            ['feminino', 'Feminino'],
                                            ['masculino', 'Masculino'],
                                        ] as const).map(([value, label]) => {
                                            const selected = patient.sexo === value;
                                            return (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    onClick={() => setPatient({ ...patient, sexo: value })}
                                                    style={{
                                                        flex: 1,
                                                        padding: '10px 12px',
                                                        borderRadius: '12px',
                                                        border: selected ? '1px solid #93C5FD' : '1px solid #e2e8f0',
                                                        background: selected ? '#eff6ff' : '#f8fafc',
                                                        color: selected ? '#1E40AF' : '#334155',
                                                        fontWeight: 600,
                                                        fontSize: '0.95rem',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </fieldset>

                                {formError ? (
                                    <p style={{ color: '#B91C1C', marginBottom: '1rem', fontSize: '0.9rem', textAlign: 'left' }}>
                                        {formError}
                                    </p>
                                ) : null}

                                {loadError ? (
                                    <p style={{ color: '#B91C1C', marginBottom: '1rem', fontSize: '0.9rem', textAlign: 'left' }}>
                                        {loadError}{' '}
                                        <Link to="/balancas" style={{ color: '#2563EB' }}>Ir para cadastro</Link>
                                    </p>
                                ) : scales.length === 0 ? (
                                    <p style={{ color: '#64748B', marginBottom: '1rem', fontSize: '0.9rem', textAlign: 'left' }}>
                                        Nenhuma balança cadastrada.{' '}
                                        <Link to="/balancas" style={{ color: '#2563EB' }}>Cadastrar agora</Link>
                                    </p>
                                ) : null}

                                <button
                                    type="submit"
                                    style={{
                                        width: '100%',
                                        background: '#2563EB',
                                        color: '#fff',
                                        border: 0,
                                        borderRadius: '12px',
                                        padding: '12px 16px',
                                        fontWeight: 600,
                                        fontSize: '1rem',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Ir para a balança
                                </button>
                            </form>
                        </>
                    ) : (
                        <>
                            <header style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        background: '#eff6ff',
                                        padding: '10px',
                                        borderRadius: '12px',
                                        color: '#3B82F6',
                                        display: 'flex',
                                    }}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="m7 7 10 10-5 5V2l5 5-10 10" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#1E293B', fontWeight: '700' }}>
                                            {composition ? 'Resultado' : 'Pesagem'}
                                        </h1>
                                        <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748B' }}>
                                            {composition ? 'Estimativas a partir dos dados informados' : 'Canal de leituras em tempo real'}
                                        </p>
                                    </div>
                                </div>

                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: '#f8fafc',
                                    padding: '8px 16px',
                                    borderRadius: '999px',
                                    border: '1px solid #e2e8f0',
                                    fontSize: '0.875rem',
                                    color: '#475569',
                                    fontWeight: '500',
                                }}>
                                    <div
                                        className={`status-dot ${isLive && !isDone ? 'live' : ''}`}
                                        style={{
                                            width: '10px',
                                            height: '10px',
                                            borderRadius: '50%',
                                            backgroundColor: statusColor,
                                            transition: 'background-color 0.3s ease',
                                        }}
                                    />
                                    {isDone ? 'Captura concluída' : isLive ? 'Ao vivo' : status}
                                </div>
                            </header>

                            <p style={{
                                width: '100%',
                                margin: '0 0 1rem',
                                padding: '10px 12px',
                                borderRadius: '12px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                color: '#475569',
                                fontSize: '0.875rem',
                                textAlign: 'left',
                            }}>
                                {patient.sexo === 'feminino' ? 'Feminino' : 'Masculino'}
                                {' · '}
                                {patient.altura.replace(',', '.')} cm
                                {' · '}
                                aniv. {patient.aniversario.split('-').reverse().join('/')}
                                {composition ? ` · ${composition.idade} anos` : ''}
                            </p>

                            {!composition && scales.length > 0 ? (
                                <label style={{ width: '100%', marginBottom: '1.5rem', textAlign: 'left', color: '#475569', fontSize: '0.875rem' }}>
                                    Balança
                                    <select
                                        value={selectedId}
                                        onChange={(event) => setSelectedId(event.target.value)}
                                        style={fieldStyle}
                                    >
                                        {scales.map((scale) => (
                                            <option key={scale.id} value={scale.id}>
                                                {scale.name} {scale.is_default ? '(padrão)' : ''} {!scale.is_active ? '(inativa)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ) : null}

                            <section style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '100%',
                                padding: composition ? '0.25rem 0 1rem' : '1rem 0',
                            }}>
                                {!composition ? (
                                    <div style={{
                                        fontSize: '1rem',
                                        fontWeight: '600',
                                        color: '#3B82F6',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        marginBottom: '0.5rem',
                                    }}>
                                        {scaleName}
                                    </div>
                                ) : null}

                                <div style={{
                                    display: 'flex',
                                    alignItems: 'baseline',
                                    gap: '8px',
                                    margin: composition ? '0.25rem 0 0.5rem' : '1rem 0',
                                }}>
                                    <span style={{
                                        fontSize: composition ? '3.5rem' : '6.5rem',
                                        fontWeight: '800',
                                        color: currentWeight !== null ? '#0F172A' : '#CBD5E1',
                                        lineHeight: '1',
                                        letterSpacing: '-0.04em',
                                        fontVariantNumeric: 'tabular-nums',
                                        transition: 'color 0.3s ease, font-size 0.3s ease',
                                    }}>
                                        {currentWeight !== null ? currentWeight.toFixed(2) : '--.--'}
                                    </span>
                                    <span style={{
                                        fontSize: composition ? '1.5rem' : '2.5rem',
                                        fontWeight: '600',
                                        color: currentWeight !== null ? '#64748B' : '#CBD5E1',
                                    }}>
                                        kg
                                    </span>
                                </div>

                                {!composition ? (
                                    <div style={{
                                        marginTop: '1.5rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        color: '#94A3B8',
                                        fontSize: '0.875rem',
                                    }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                                        </svg>
                                        {currentWeight !== null
                                            ? 'Aguardando peso estável...'
                                            : `Última captura: ${lastUpdate}`}
                                    </div>
                                ) : null}
                            </section>

                            {composition ? (
                                <section style={{ width: '100%', marginBottom: '1.25rem' }}>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                                        gap: '10px',
                                    }}>
                                        <MetricCard
                                            label="IMC"
                                            value={`${composition.imc}`}
                                            hint={composition.imcClassificacao}
                                        />
                                        <MetricCard
                                            label="% Gordura"
                                            value={`${composition.percentualGordura}%`}
                                            hint="Estimativa Deurenberg"
                                        />
                                        <MetricCard
                                            label="Massa gorda"
                                            value={`${composition.massaGordaKg} kg`}
                                        />
                                        <MetricCard
                                            label="Massa magra"
                                            value={`${composition.massaMagraKg} kg`}
                                        />
                                        <MetricCard
                                            label="Água corporal"
                                            value={`${composition.aguaCorporalKg} kg`}
                                            hint={`${composition.aguaCorporalPct}% do peso`}
                                        />
                                        <MetricCard
                                            label="TMB"
                                            value={`${composition.tmbKcal} kcal`}
                                            hint="Mifflin–St Jeor / dia"
                                        />
                                    </div>
                                    <p style={{
                                        margin: '12px 0 0',
                                        color: '#94A3B8',
                                        fontSize: '0.75rem',
                                        textAlign: 'left',
                                        lineHeight: 1.4,
                                    }}>
                                        Valores estimados por fórmulas antropométricas (não são medição por bioimpedância elétrica).
                                    </p>
                                </section>
                            ) : null}

                            <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: composition ? 'stretch' : 'center' }}>
                                {composition ? (
                                    <button
                                        type="button"
                                        onClick={novaCaptura}
                                        style={{
                                            flex: 1,
                                            background: '#2563EB',
                                            color: '#fff',
                                            border: 0,
                                            borderRadius: '12px',
                                            padding: '10px 16px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Nova captura
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={backToDados}
                                    style={{
                                        flex: composition ? 1 : undefined,
                                        background: '#fff',
                                        color: '#334155',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '12px',
                                        padding: '10px 16px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Voltar aos dados
                                </button>
                            </div>
                        </>
                    )}
                </main>
            </div>
        </AppLayout>
    );
};
