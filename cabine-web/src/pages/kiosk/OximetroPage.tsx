import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';

const HOLD_MS = 5000;

export function OximetroPage() {
    const navigate = useNavigate();
    const { session } = useKiosk();
    const [remaining, setRemaining] = useState(5);

    useEffect(() => {
        if (!session.person) return;
        const started = Date.now();
        const tick = window.setInterval(() => {
            const left = Math.max(0, HOLD_MS - (Date.now() - started));
            setRemaining(Math.ceil(left / 1000));
            if (left <= 0) {
                window.clearInterval(tick);
                navigate('/conclusao', { replace: true });
            }
        }, 200);
        return () => window.clearInterval(tick);
    }, [navigate, session.person]);

    if (!session.person) return <Navigate to="/matricula" replace />;

    return (
        <KioskLayout>
            <div className="kiosk-center-card">
                <p className="kiosk-step-label">2 · Passo</p>
                <h1 className="kiosk-title">Posicione o dedo indicador no oxímetro</h1>
                <div className="kiosk-oximeter-art" aria-hidden>
                    <svg viewBox="0 0 220 160" width="220" height="160">
                        <ellipse cx="110" cy="140" rx="70" ry="10" fill="#e2e8f0" />
                        <path
                            d="M40 90 C60 40, 90 30, 110 55 C130 30, 160 40, 180 90 L160 120 C140 100, 80 100, 60 120 Z"
                            fill="#fecaca"
                            className="kiosk-oximeter-hand"
                        />
                        <rect x="95" y="48" width="50" height="36" rx="10" fill="#0f766e" className="kiosk-oximeter-clip" />
                        <circle cx="120" cy="66" r="6" fill="#99f6e4" className="kiosk-oximeter-pulse" />
                    </svg>
                </div>
                <p className="kiosk-subtitle">Aguarde alguns segundos… {remaining}s</p>
                <div className="kiosk-progress-track" style={{ maxWidth: 280, margin: '0 auto' }}>
                    <div
                        className="kiosk-progress-fill"
                        style={{ width: `${((5 - remaining) / 5) * 100}%` }}
                    />
                </div>
            </div>
        </KioskLayout>
    );
}
