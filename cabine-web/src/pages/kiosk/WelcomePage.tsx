import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ConfirmDialog, END_SESSION_CONFIRM } from '../../components/ConfirmDialog';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { useKiosk } from '../../kiosk/KioskContext';
import { clearAccessSession, isAccessSessionValid } from '../../session/authSession';

export function WelcomePage() {
    const navigate = useNavigate();
    const { clearSession } = useKiosk();
    const hasSession = isAccessSessionValid();
    const [confirmEnd, setConfirmEnd] = useState(false);

    function handleLogout() {
        clearSession();
        clearAccessSession();
        setConfirmEnd(false);
        navigate('/', { replace: true });
    }

    return (
        <KioskLayout showUser={false}>
            <div className="kiosk-center-card">
                <div className="kiosk-brand-mark">CN</div>
                <h1 className="kiosk-title">CabiNET</h1>
                <p className="kiosk-subtitle">Acompanhamento de bem-estar</p>
                <button
                    type="button"
                    className="kiosk-btn kiosk-btn-primary kiosk-btn-xl"
                    onClick={() => navigate('/matricula')}
                >
                    Iniciar
                </button>
                {hasSession ? (
                    <button type="button" className="kiosk-btn kiosk-btn-ghost" onClick={() => setConfirmEnd(true)}>
                        Encerrar sessão
                    </button>
                ) : null}
            </div>
            <ConfirmDialog
                open={confirmEnd}
                title={END_SESSION_CONFIRM.title}
                description={END_SESSION_CONFIRM.description}
                cancelLabel={END_SESSION_CONFIRM.cancelLabel}
                confirmLabel={END_SESSION_CONFIRM.confirmLabel}
                onCancel={() => setConfirmEnd(false)}
                onConfirm={handleLogout}
            />
        </KioskLayout>
    );
}
