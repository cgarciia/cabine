import { Navigate, useNavigate } from 'react-router-dom';

import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';

export function ConclusaoPage() {
    const navigate = useNavigate();
    const { session } = useKiosk();
    if (!session.person) return <Navigate to="/matricula" replace />;

    return (
        <KioskLayout>
            <div className="kiosk-center-card">
                <div className="kiosk-success-ring" aria-hidden />
                <h1 className="kiosk-title">Sua avaliação foi concluída</h1>
                <p className="kiosk-subtitle">
                    Retorne ao menu para visualizar o relatório.
                </p>
                <button
                    type="button"
                    className="kiosk-btn kiosk-btn-primary kiosk-btn-xl"
                    onClick={() => navigate('/menu')}
                >
                    ← Menu
                </button>
            </div>
        </KioskLayout>
    );
}
