import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api';
import { AppLayout } from '../components/AppLayout';
import type { Scale } from '../types/scale';

interface ScalePayload {
    type: string;
    balanca_nome?: string;
    peso_kg?: number;
    timestamp?: string;
    msg?: string;
}

export const ScalePage = () => {
    const [scales, setScales] = useState<Scale[]>([]);
    const [selectedId, setSelectedId] = useState<string>('');
    const [currentWeight, setCurrentWeight] = useState<number | null>(null);
    const [scaleName, setScaleName] = useState<string>('Buscando dispositivo...');
    const [lastUpdate, setLastUpdate] = useState<string>('--:--:--');
    const [status, setStatus] = useState('Desconectado');
    const [loadError, setLoadError] = useState('');
    const wsRef = useRef<WebSocket | null>(null);

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
            setStatus('Não foi possível carregar as balanças cadastradas.');
        });
    }, []);

    useEffect(() => {
        if (!selectedId) return;

        const selected = scales.find((item) => item.id === selectedId);
        if (selected) setScaleName(selected.name);

        setCurrentWeight(null);
        setLastUpdate('--:--:--');

        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const wsUrl = baseUrl.replace('http', 'ws');
        const ws = new WebSocket(`${wsUrl}/ws/scale?scale_id=${selectedId}`);
        wsRef.current = ws;

        ws.onopen = () => setStatus('Conectando ao serviço...');
        ws.onclose = () => setStatus('Desconectado do servidor');

        ws.onmessage = (event) => {
            const data: ScalePayload = JSON.parse(event.data);

            if (data.type === 'STATUS' && data.msg) {
                setStatus(data.msg);
            } else if (data.type === 'PESO_RECEBIDO' && data.peso_kg !== undefined) {
                setStatus('Monitoramento em tempo real');
                setCurrentWeight(data.peso_kg);
                if (data.balanca_nome) setScaleName(data.balanca_nome);
                if (data.timestamp) setLastUpdate(data.timestamp);
            }
        };

        return () => {
            ws.close();
        };
    }, [selectedId, scales]);

    const isLive = status.includes('tempo real');
    const isError = status.includes('Desconectado') || status.includes('Erro') || status.includes('Falha') || status.includes('Não foi possível');
    const statusColor = isLive ? '#10B981' : isError ? '#EF4444' : '#F59E0B';

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
                    maxWidth: '540px',
                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '6px',
                        background: `linear-gradient(90deg, ${statusColor} 0%, #3B82F6 100%)`,
                        transition: 'background 0.5s ease'
                    }} />

                    <header style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                background: '#eff6ff',
                                padding: '10px',
                                borderRadius: '12px',
                                color: '#3B82F6',
                                display: 'flex'
                            }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m7 7 10 10-5 5V2l5 5-10 10"/>
                                </svg>
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#1E293B', fontWeight: '700' }}>Pesagem</h1>
                                <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748B' }}>Canal de leituras em tempo real</p>
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
                            fontWeight: '500'
                        }}>
                            <div
                                className={`status-dot ${isLive ? 'live' : ''}`}
                                style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    backgroundColor: statusColor,
                                    transition: 'background-color 0.3s ease'
                                }}
                            />
                            {isLive ? 'Ao vivo' : status}
                        </div>
                    </header>

                    {loadError ? (
                        <p style={{ color: '#B91C1C', textAlign: 'center' }}>{loadError}</p>
                    ) : scales.length === 0 ? (
                        <p style={{ color: '#64748B', textAlign: 'center' }}>
                            Nenhuma balança cadastrada.{' '}
                            <Link to="/balancas" style={{ color: '#2563EB' }}>Cadastrar agora</Link>
                        </p>
                    ) : (
                        <label style={{ width: '100%', marginBottom: '1.5rem', textAlign: 'left', color: '#475569', fontSize: '0.875rem' }}>
                            Balança
                            <select
                                value={selectedId}
                                onChange={(event) => setSelectedId(event.target.value)}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    marginTop: '6px',
                                    padding: '10px 12px',
                                    borderRadius: '12px',
                                    border: '1px solid #e2e8f0',
                                    fontSize: '1rem',
                                    color: '#0F172A',
                                    background: '#f8fafc',
                                }}
                            >
                                {scales.map((scale) => (
                                    <option key={scale.id} value={scale.id}>
                                        {scale.name} {scale.is_default ? '(padrão)' : ''} {!scale.is_active ? '(inativa)' : ''}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}

                    <section style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        padding: '1rem 0',
                    }}>
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

                        <div style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: '8px',
                            margin: '1rem 0',
                        }}>
                            <span style={{
                                fontSize: '6.5rem',
                                fontWeight: '800',
                                color: currentWeight !== null ? '#0F172A' : '#CBD5E1',
                                lineHeight: '1',
                                letterSpacing: '-0.04em',
                                fontVariantNumeric: 'tabular-nums',
                                transition: 'color 0.3s ease'
                            }}>
                                {currentWeight !== null ? currentWeight.toFixed(2) : '--.--'}
                            </span>
                            <span style={{
                                fontSize: '2.5rem',
                                fontWeight: '600',
                                color: currentWeight !== null ? '#64748B' : '#CBD5E1',
                            }}>
                                kg
                            </span>
                        </div>

                        <div style={{
                            marginTop: '1.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: '#94A3B8',
                            fontSize: '0.875rem'
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                            </svg>
                            Última captura: {lastUpdate}
                        </div>
                    </section>
                </main>
            </div>
        </AppLayout>
    );
};
