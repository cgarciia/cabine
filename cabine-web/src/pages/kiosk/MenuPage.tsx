import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
    Activity,
    Brain,
    ChevronRight,
    ClipboardList,
    HeartPulse,
    Menu,
    Scale,
    type LucideIcon,
} from 'lucide-react';

import { ConfirmDialog, END_SESSION_CONFIRM } from '../../components/ConfirmDialog';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { clearAccessSession } from '../../session/authSession';
import { isVisitComplete } from '../../utils/kioskProgress';
import { requestOmronMicPermission } from '../../utils/omronEcgMic';

type MenuItem = {
    id: string;
    title: string;
    subtitle: string;
    path: string;
    done: boolean;
    icon: LucideIcon;
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
            id: 'general',
            title: 'Saúde Geral',
            subtitle: 'Triagem rápida sobre hábitos, sintomas e como você avalia sua saúde hoje.',
            path: '/saude-geral',
            done: Boolean(session.generalHealth),
            icon: ClipboardList,
        },
        {
            id: 'mental',
            title: 'Saúde Mental',
            subtitle: 'Convite opcional com perguntas curtas sobre bem-estar emocional e humor.',
            path: '/saude-mental',
            done: Boolean(session.mentalHealth?.completedAt || session.mentalHealth?.refused),
            icon: Brain,
        },
        {
            id: 'bia',
            title: 'Bioimpedância',
            subtitle: 'Suba na balança para medir peso e composição corporal com orientação na tela.',
            path: '/bioimpedancia',
            done: Boolean(session.lastMeasurement),
            icon: Scale,
        },
        {
            id: 'oximeter',
            title: 'Oximetria',
            subtitle: 'Coloque o dedo no oxímetro para ler oxigenação (SpO₂) e pulso automaticamente.',
            path: '/oximetro',
            done: Boolean(session.lastOximeter),
            icon: Activity,
        },
        {
            id: 'bloodPressure',
            title: 'Pressão e pulso',
            subtitle: 'Manguito, dedos nos sensores e START/STOP no Complete. Sem iniciar nesta tela.',
            path: '/pressao',
            done: Boolean(session.lastBloodPressure),
            icon: HeartPulse,
        },
    ];

    function endVisit() {
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
                    <Menu size={26} strokeWidth={2} />
                </button>

                <div className="kiosk-menu-heading">
                    <h1 className="kiosk-title">O que você quer fazer agora?</h1>
                    <p className="kiosk-subtitle">
                        Escolha uma etapa. Você pode concluir tudo agora ou voltar depois nesta sessão.
                    </p>
                </div>

                <div className="kiosk-menu-grid">
                    {items.map((item) => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                className={`kiosk-menu-tile${item.done ? ' is-done' : ''}`}
                                onClick={() => {
                                    if (item.id === 'bloodPressure') {
                                        void requestOmronMicPermission().finally(() => navigate(item.path));
                                        return;
                                    }
                                    navigate(item.path);
                                }}
                            >
                                <span className="kiosk-menu-tile-icon">
                                    <Icon size={28} strokeWidth={1.75} aria-hidden />
                                </span>
                                <span className="kiosk-menu-tile-body">
                                    <span className="kiosk-menu-tile-top">
                                        <strong>{item.title}</strong>
                                        {item.done ? <em className="kiosk-done-pill">Concluído</em> : null}
                                    </span>
                                    <span className="kiosk-menu-tile-desc">{item.subtitle}</span>
                                </span>
                                <ChevronRight className="kiosk-menu-tile-arrow" size={22} strokeWidth={2} aria-hidden />
                            </button>
                        );
                    })}
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
                onConfirm={endVisit}
            />
        </KioskLayout>
    );
}
