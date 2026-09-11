import { useNavigate } from 'react-router-dom';

import { KioskLayout } from '../../kiosk/KioskLayout';

export function WelcomePage() {
    const navigate = useNavigate();

    return (
        <KioskLayout showUser={false}>
            <div className="kiosk-center-card">
                <div className="kiosk-brand-mark">C</div>
                <h1 className="kiosk-title">Cabine Bem Vínculo</h1>
                <p className="kiosk-subtitle">Acompanhamento de bem-estar</p>
                <button
                    type="button"
                    className="kiosk-btn kiosk-btn-primary kiosk-btn-xl"
                    onClick={() => navigate('/matricula')}
                >
                    Iniciar
                </button>
            </div>
        </KioskLayout>
    );
}
