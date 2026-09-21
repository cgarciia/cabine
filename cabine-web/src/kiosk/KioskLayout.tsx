import { FileText, LogOut, PencilLine, X } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useState, type ReactNode } from 'react';

import { ConfirmDialog, END_SESSION_CONFIRM } from '../components/ConfirmDialog';
import { clearAccessSession } from '../session/authSession';
import { useKiosk } from './KioskContext';

type Props = {
    children: ReactNode;
    showUser?: boolean;
    sidebarOpen?: boolean;
    onCloseSidebar?: () => void;
    activeSidebar?: 'edit' | 'records' | null;
};

export function KioskLayout({
    children,
    showUser = true,
    sidebarOpen = false,
    onCloseSidebar,
    activeSidebar = null,
}: Props) {
    const { session, clearSession } = useKiosk();
    const navigate = useNavigate();
    const person = session.person;
    const [confirmEnd, setConfirmEnd] = useState(false);

    function endSession() {
        clearSession();
        clearAccessSession();
        setConfirmEnd(false);
        navigate('/', { replace: true });
    }

    return (
        <div className="kiosk-shell">
            {showUser && person ? (
                <header className="kiosk-header no-print">
                    <div className="kiosk-user">
                        <span className="kiosk-user-avatar" aria-hidden />
                        <span>
                            {person.name}
                            {person.matricula ? ` · ${person.matricula}` : ''}
                        </span>
                    </div>
                    <button type="button" className="kiosk-link-btn" onClick={() => setConfirmEnd(true)}>
                        <LogOut size={18} strokeWidth={2.2} aria-hidden />
                        Sair
                    </button>
                </header>
            ) : null}

            <main className="kiosk-main">{children}</main>

            <ConfirmDialog
                open={confirmEnd}
                title={END_SESSION_CONFIRM.title}
                description={END_SESSION_CONFIRM.description}
                cancelLabel={END_SESSION_CONFIRM.cancelLabel}
                confirmLabel={END_SESSION_CONFIRM.confirmLabel}
                onCancel={() => setConfirmEnd(false)}
                onConfirm={endSession}
            />

            {sidebarOpen ? (
                <div className="kiosk-sidebar-backdrop no-print" onClick={onCloseSidebar}>
                    <aside
                        className="kiosk-sidebar"
                        onClick={(event) => event.stopPropagation()}
                        aria-label="Menu lateral"
                    >
                        <div className="kiosk-sidebar-title">Menu</div>
                        <NavLink
                            to="/cadastro?edit=1"
                            className={() => `kiosk-sidebar-item${activeSidebar === 'edit' ? ' active' : ''}`}
                            onClick={onCloseSidebar}
                        >
                            <PencilLine size={20} strokeWidth={2} aria-hidden />
                            Editar cadastro
                        </NavLink>
                        <NavLink
                            to="/registros"
                            className={() => `kiosk-sidebar-item${activeSidebar === 'records' ? ' active' : ''}`}
                            onClick={onCloseSidebar}
                        >
                            <FileText size={20} strokeWidth={2} aria-hidden />
                            Visualizar registros
                        </NavLink>
                        <button type="button" className="kiosk-sidebar-close" onClick={onCloseSidebar}>
                            <X size={20} strokeWidth={2} aria-hidden />
                            Fechar
                        </button>
                    </aside>
                </div>
            ) : null}
        </div>
    );
}
