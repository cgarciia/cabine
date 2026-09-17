import { useState, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { ConfirmDialog, END_SESSION_CONFIRM } from '../../components/ConfirmDialog';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { clearAccessSession } from '../../session/authSession';
import { isVisitComplete } from '../../utils/kioskProgress';

type MenuItem = {
    id: string;
    title: string;
    subtitle: string;
    path: string;
    done: boolean;
    icon: ReactNode;
};

export function MenuPage() {
    const navigate = useNavigate();
    const { session, clearSession, hasReportData } = useKiosk();
    const visitComplete = isVisitComplete(session);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [confirmEnd, setConfirmEnd] = useState(false);

    if (!session.person) return <Navigate to="/matricula" replace />;

    const items: MenuItem[] = [
        {
            id: 'geral',
            title: 'Saúde Geral',
            subtitle: 'Triagem rápida sobre hábitos, sintomas e como você avalia sua saúde hoje.',
            path: '/saude-geral',
            done: Boolean(session.saudeGeral),
            icon: (
                <svg viewBox="0 0 48 48" aria-hidden>
                    <rect x="8" y="10" width="32" height="28" rx="8" fill="currentColor" opacity="0.12" />
                    <path
                        d="M16 22h16M24 14v16"
                        stroke="currentColor"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                    />
                    <circle cx="24" cy="30" r="2.2" fill="currentColor" />
                </svg>
            ),
        },
        {
            id: 'mental',
            title: 'Saúde Mental',
            subtitle: 'Convite opcional com perguntas curtas sobre bem-estar emocional e humor.',
            path: '/saude-mental',
            done: Boolean(session.saudeMental?.completedAt || session.saudeMental?.refused),
            icon: (
                <svg viewBox="0 0 48 48" aria-hidden>
                    <path
                        d="M24 10c-7.2 0-13 5.4-13 12.1 0 4.2 2.2 7.9 5.6 10.1L15 38l8.3-4.2c.2 0 .5.1.7.1 7.2 0 13-5.4 13-12.1S31.2 10 24 10Z"
                        fill="currentColor"
                        opacity="0.12"
                    />
                    <path
                        d="M18.5 23.5c0-1.4 1-2.5 2.3-2.5s2.3 1.1 2.3 2.5M24.9 23.5c0-1.4 1-2.5 2.3-2.5s2.3 1.1 2.3 2.5"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                    />
                    <path
                        d="M19.5 29c1.4 1.5 3 2.2 4.5 2.2s3.1-.7 4.5-2.2"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        fill="none"
                    />
                </svg>
            ),
        },
        {
            id: 'bia',
            title: 'Bioimpedância',
            subtitle: 'Suba na balança para medir peso e composição corporal com orientação na tela.',
            path: '/bioimpedancia',
            done: Boolean(session.lastMeasurement),
            icon: (
                <svg viewBox="0 0 48 48" aria-hidden>
                    <rect x="10" y="12" width="28" height="26" rx="8" fill="currentColor" opacity="0.12" />
                    <rect x="16" y="18" width="16" height="8" rx="3" stroke="currentColor" strokeWidth="2.6" fill="none" />
                    <path
                        d="M18 32h12M21 36h6"
                        stroke="currentColor"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                    />
                </svg>
            ),
        },
        {
            id: 'oxi',
            title: 'Oximetria',
            subtitle: 'Coloque o dedo no oxímetro para ler oxigenação (SpO₂) e pulso automaticamente.',
            path: '/oximetro',
            done: Boolean(session.lastOximeter),
            icon: (
                <svg viewBox="0 0 48 48" aria-hidden>
                    <path
                        d="M14 28c0-6.6 4.5-12 10-12s10 5.4 10 12"
                        fill="currentColor"
                        opacity="0.12"
                    />
                    <path
                        d="M12 30h6l3-8 5 16 3-10h7"
                        stroke="currentColor"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                    />
                    <circle cx="34" cy="18" r="3.2" fill="currentColor" />
                </svg>
            ),
        },
    ];

    function encerrar() {
        clearSession();
        clearAccessSession();
        setConfirmEnd(false);
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

                <div className="kiosk-menu-heading">
                    <h1 className="kiosk-title">O que você quer fazer agora?</h1>
                    <p className="kiosk-subtitle">
                        Escolha uma etapa. Você pode concluir tudo agora ou voltar depois nesta sessão.
                    </p>
                </div>

                <div className="kiosk-menu-grid">
                    {items.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={`kiosk-menu-tile${item.done ? ' is-done' : ''}`}
                            onClick={() => navigate(item.path)}
                        >
                            <span className="kiosk-menu-tile-icon">{item.icon}</span>
                            <span className="kiosk-menu-tile-body">
                                <span className="kiosk-menu-tile-top">
                                    <strong>{item.title}</strong>
                                    {item.done ? <em className="kiosk-done-pill">Concluído</em> : null}
                                </span>
                                <span className="kiosk-menu-tile-desc">{item.subtitle}</span>
                            </span>
                            <span className="kiosk-menu-tile-arrow" aria-hidden>
                                →
                            </span>
                        </button>
                    ))}
                </div>

                <div className="kiosk-menu-footer">
                    {visitComplete ? (
                        <button
                            type="button"
                            className="kiosk-btn kiosk-btn-primary kiosk-btn-xl"
                            onClick={() => navigate('/conclusao')}
                        >
                            Ver conclusão
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className="kiosk-btn kiosk-btn-secondary kiosk-btn-xl"
                        disabled={!hasReportData}
                        onClick={() => navigate('/relatorio')}
                    >
                        Visualizar relatório
                    </button>

                    <button
                        type="button"
                        className="kiosk-btn kiosk-btn-ghost"
                        onClick={() => setConfirmEnd(true)}
                    >
                        Encerrar sessão
                    </button>
                </div>
            </div>

            <ConfirmDialog
                open={confirmEnd}
                title={END_SESSION_CONFIRM.title}
                description={END_SESSION_CONFIRM.description}
                cancelLabel={END_SESSION_CONFIRM.cancelLabel}
                confirmLabel={END_SESSION_CONFIRM.confirmLabel}
                onCancel={() => setConfirmEnd(false)}
                onConfirm={encerrar}
            />
        </KioskLayout>
    );
}
