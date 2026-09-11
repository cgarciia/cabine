import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';

export function MenuPage() {
    const navigate = useNavigate();
    const { session, clearSession, hasReportData } = useKiosk();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [confirmEnd, setConfirmEnd] = useState(false);

    if (!session.person) return <Navigate to="/matricula" replace />;

    const geralDone = Boolean(session.saudeGeral);
    const mentalDone = Boolean(session.saudeMental);
    const biaDone = Boolean(session.lastMeasurement);

    function encerrar() {
        clearSession();
        navigate('/', { replace: true });
    }

    return (
        <KioskLayout sidebarOpen={sidebarOpen} onCloseSidebar={() => setSidebarOpen(false)}>
            <div className="kiosk-menu">
                <button
                    type="button"
                    className="kiosk-hamburger no-print"
                    aria-label="Abrir menu"
                    onClick={() => setSidebarOpen(true)}
                >
                    <span />
                    <span />
                    <span />
                </button>

                <h1 className="kiosk-title">O que você quer fazer agora?</h1>

                <div className="kiosk-menu-actions">
                    <button
                        type="button"
                        className="kiosk-menu-card"
                        onClick={() => navigate('/saude-geral')}
                    >
                        <span>Questionário Saúde Geral</span>
                        {geralDone ? <em className="kiosk-done-pill">Concluído</em> : null}
                    </button>
                    <button
                        type="button"
                        className="kiosk-menu-card"
                        onClick={() => navigate('/saude-mental')}
                    >
                        <span>Questionário Saúde Mental</span>
                        {mentalDone ? <em className="kiosk-done-pill">Concluído</em> : null}
                    </button>
                    <button
                        type="button"
                        className="kiosk-menu-card"
                        onClick={() => navigate('/bioimpedancia')}
                    >
                        <span>Medição Bioimpedância</span>
                        {biaDone ? <em className="kiosk-done-pill">Concluído</em> : null}
                    </button>
                </div>

                <button
                    type="button"
                    className="kiosk-btn kiosk-btn-secondary"
                    disabled={!hasReportData}
                    onClick={() => navigate('/relatorio')}
                >
                    Visualizar Relatório
                </button>

                <button
                    type="button"
                    className="kiosk-btn kiosk-btn-ghost"
                    onClick={() => setConfirmEnd(true)}
                >
                    Encerrar sessão
                </button>
            </div>

            {confirmEnd ? (
                <div className="kiosk-modal-backdrop no-print">
                    <div className="kiosk-modal" role="dialog" aria-labelledby="end-title">
                        <h2 id="end-title">Deseja encerrar?</h2>
                        <p>A sessão será finalizada e você voltará à tela inicial.</p>
                        <div className="kiosk-modal-actions">
                            <button type="button" className="kiosk-btn kiosk-btn-ghost" onClick={() => setConfirmEnd(false)}>
                                Voltar
                            </button>
                            <button type="button" className="kiosk-btn kiosk-btn-primary" onClick={encerrar}>
                                Continuar
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </KioskLayout>
    );
}
