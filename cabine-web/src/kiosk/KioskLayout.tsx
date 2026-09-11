import { NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useKiosk } from './KioskContext';

type Props = {
    children: ReactNode;
    showUser?: boolean;
    sidebarOpen?: boolean;
    onCloseSidebar?: () => void;
    activeSidebar?: 'editar' | 'registros' | null;
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

    function handleSair() {
        clearSession();
        navigate('/');
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
                    <button type="button" className="kiosk-link-btn" onClick={handleSair}>
                        sair
                    </button>
                </header>
            ) : null}

            <main className="kiosk-main">{children}</main>

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
                            className={() => `kiosk-sidebar-item${activeSidebar === 'editar' ? ' active' : ''}`}
                            onClick={onCloseSidebar}
                        >
                            Editar cadastro
                        </NavLink>
                        <NavLink
                            to="/registros"
                            className={() => `kiosk-sidebar-item${activeSidebar === 'registros' ? ' active' : ''}`}
                            onClick={onCloseSidebar}
                        >
                            Visualizar registros
                        </NavLink>
                        <button type="button" className="kiosk-sidebar-close" onClick={onCloseSidebar}>
                            Fechar
                        </button>
                    </aside>
                </div>
            ) : null}
        </div>
    );
}
