import { useEffect, useState, useRef } from 'react';

interface ScalePayload {
    type: string;
    balanca_nome?: string;
    peso_kg?: number;
    timestamp?: string;
    msg?: string;
}

export const ScalePage = () => {
    const [currentWeight, setCurrentWeight] = useState<number | null>(null);
    const [scaleName, setScaleName] = useState<string>('Buscando dispositivo...');
    const [lastUpdate, setLastUpdate] = useState<string>('--:--:--');
    const [status, setStatus] = useState('Desconectado');
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const wsUrl = baseUrl.replace('http', 'ws');

        const ws = new WebSocket(`${wsUrl}/ws/scale`);
        wsRef.current = ws;

        ws.onopen = () => setStatus('Conectando ao serviço...');
        ws.onclose = () => setStatus('Desconectado do servidor');

        ws.onmessage = (event) => {
            const data: ScalePayload = JSON.parse(event.data);

            if (data.type === "STATUS" && data.msg) {
                setStatus(data.msg);
            } else if (data.type === "PESO_RECEBIDO" && data.peso_kg !== undefined) {
                setStatus('Monitoramento em tempo real');
                setCurrentWeight(data.peso_kg);

                if (data.balanca_nome) setScaleName(data.balanca_nome);
                if (data.timestamp) setLastUpdate(data.timestamp);
            }
        };

        return () => {
            ws.close();
        };
    }, []);

    // Lógica para definir as cores do status visualmente
    const isLive = status.includes('tempo real');
    const isError = status.includes('Desconectado') || status.includes('Erro');
    const statusColor = isLive ? '#10B981' : isError ? '#EF4444' : '#F59E0B';

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #f6f8fd 0%, #f1f5f9 100%)',
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            padding: '2rem'
        }}>
            {/* Injeção de CSS para a animação do "Led" de gravação/live */}
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
                {/* Faixa superior decorativa */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '6px',
                    background: `linear-gradient(90deg, ${statusColor} 0%, #3B82F6 100%)`,
                    transition: 'background 0.5s ease'
                }} />

                {/* Cabeçalho */}
                <header style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Ícone Bluetooth */}
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
                            <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#1E293B', fontWeight: '700' }}>Cabine</h1>
                            <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748B' }}>Central de Pesagem</p>
                        </div>
                    </div>

                    {/* Pill de Status */}
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

                {/* Display Principal */}
                <section style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    padding: '2rem 0',
                    position: 'relative'
                }}>
                    <div style={{
                        fontSize: '1rem',
                        fontWeight: '600',
                        color: '#3B82F6',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
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

                    {/* Informações Extras (Rodapé do Display) */}
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
    );
};