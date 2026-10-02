import { useEffect, useState, type ReactNode } from 'react';

import { apiErrorMessage, fetchCurrentCabin, isNotFound } from '../api';
import { KioskLayout } from '../kiosk/KioskLayout';
import { CabinSetupPage } from '../pages/kiosk/CabinSetupPage';

type Phase = 'loading' | 'ready' | 'setup' | 'unavailable';

export function CabinGate({ children }: { children: ReactNode }) {
    const [phase, setPhase] = useState<Phase>('loading');
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetchCurrentCabin()
            .then(() => {
                if (!cancelled) setPhase('ready');
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                if (isNotFound(err)) {
                    setPhase('setup');
                    return;
                }
                setError(apiErrorMessage(err, 'Não foi possível verificar a cabine.'));
                setPhase('unavailable');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (phase === 'loading') {
        return (
            <KioskLayout showUser={false}>
                <div className="kiosk-center-card">
                    <p className="kiosk-subtitle">Carregando…</p>
                </div>
            </KioskLayout>
        );
    }
    if (phase === 'unavailable') {
        return (
            <KioskLayout showUser={false}>
                <div className="kiosk-center-card">
                    <p className="kiosk-error">{error}</p>
                </div>
            </KioskLayout>
        );
    }
    if (phase === 'setup') {
        return <CabinSetupPage initialError={error} onRegistered={() => setPhase('ready')} />;
    }
    return children;
}
