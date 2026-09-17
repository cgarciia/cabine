import { Navigate, useNavigate } from 'react-router-dom';

import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { isVisitComplete } from '../../utils/kioskProgress';

export function ConclusaoPage() {
    const navigate = useNavigate();
    const { session } = useKiosk();
    if (!session.person) return <Navigate to="/matricula" replace />;
    if (!isVisitComplete(session)) return <Navigate to="/menu" replace />;

    return (
        <KioskLayout>
            <div className="kiosk-center-card">
                <div className="kiosk-success-ring" aria-hidden />
                <h1 className="kiosk-title">Sua avaliação foi concluída</h1>
                <p className="kiosk-subtitle">
                    Você pode ver e imprimir o relatório desta sessão agora.
                </p>
                <button
                    type="button"
                    className="kiosk-btn kiosk-btn-primary kiosk-btn-xl"
                    onClick={() => navigate('/relatorio')}
                >
                    Ver e imprimir relatório
                </button>
                <button
                    type="button"
                    className="kiosk-btn kiosk-btn-ghost"
                    onClick={() => navigate('/menu')}
                >
                    ← Menu
                </button>
            </div>
        </KioskLayout>
    );
}
