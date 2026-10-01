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
    Thermometer,
    type LucideIcon,
} from 'lucide-react';

import { ConfirmDialog, END_SESSION_CONFIRM } from '../../components/ConfirmDialog';
import { activeModules, type MvpModule } from '../../config/mvp';
import { sameVisit } from '../../session/visitScope';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { clearAccessSession } from '../../session/authSession';
import { isVisitComplete } from '../../utils/kioskProgress';
import { requestHem7530MicPermission } from '../../utils/hem7530EcgMic';

type MenuItem = {
    id: string;
    title: string;
    subtitle: string;
    path: string;
    done: boolean;
    icon: LucideIcon;
    disabled?: boolean;
};

export function MenuPage() {
    const navigate = useNavigate();
    const { session, clearSession, hasReportData } = useKiosk();
    const visitComplete = isVisitComplete(session);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [confirmEnd, setConfirmEnd] = useState(false);

    if (!session.person) return <Navigate to="/matricula" replace />;

    function itemsFor(module: MvpModule): MenuItem[] {
        if (module === 'questionario') {
            return [
                {
                    id: 'general',
                    title: 'Saúde Geral',
                    subtitle: 'Perguntas rápidas sobre como você está hoje.',
                    path: '/saude-geral',
                    done: Boolean(session.generalHealth),
                    icon: ClipboardList,
                },
                {
                    id: 'mental',
                    title: 'Saúde Mental',
                    subtitle: 'Perguntas opcionais sobre bem-estar e humor.',
                    path: '/saude-mental',
                    done: Boolean(session.mentalHealth?.completedAt || session.mentalHealth?.refused),
                    icon: Brain,
                },
            ];
        }
        if (module === 'bioimpedancia') {
            return [
                {
                    id: 'bia',
                    title: 'Bioimpedância',
                    subtitle: 'Suba na balança. A tela orienta cada passo.',
                    path: '/bioimpedancia',
                    done: sameVisit(session.lastMeasurement, session.visitId),
                    icon: Scale,
                },
            ];
        }
        if (module === 'oximetria') {
            return [
                {
                    id: 'oximeter',
                    title: 'Oxigenação',
                    subtitle: 'Coloque o dedo no oxímetro para medir oxigênio e pulso.',
                    path: '/oximetro',
                    done: sameVisit(session.lastOximeter, session.visitId),
                    icon: Activity,
                },
            ];
        }
        if (module === 'temperatura') {
            return [
                {
                    id: 'temperatura',
                    title: 'Temperatura',
                    subtitle: 'Módulo em breve. Não disponível nesta versão.',
                    path: '',
                    done: false,
                    icon: Thermometer,
                    disabled: true,
                },
            ];
        }
        if (module === 'pressao') {
            return [
                {
                    id: 'bloodPressure',
                    title: 'Pressão com ECG',
                    subtitle: 'Manguito no braço e dedos nos sensores.',
                    path: '/pressao',
                    done: sameVisit(session.lastBloodPressure, session.visitId),
                    icon: HeartPulse,
                },
                {
                    id: 'wristBloodPressure',
                    title: 'Pressão e pulso',
                    subtitle: 'Coloque o monitor no pulso e aperte o botão.',
                    path: '/pressao-pulso',
                    done: sameVisit(session.lastWristBloodPressure, session.visitId),
                    icon: HeartPulse,
                },
            ];
        }
        return [];
    }

    const items: MenuItem[] = activeModules().flatMap(itemsFor);
    
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
                        Escolha uma etapa para começar.
                    </p>
                </div>

                <div className="kiosk-menu-grid">
                    {items.map((item) => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                disabled={Boolean(item.disabled)}
                                className={`kiosk-menu-tile${item.done ? ' is-done' : ''}${item.disabled ? ' is-disabled' : ''}`}
                                onClick={() => {
                                    if (item.id === 'bloodPressure') {
                                        void requestHem7530MicPermission().finally(() => navigate(item.path));
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
