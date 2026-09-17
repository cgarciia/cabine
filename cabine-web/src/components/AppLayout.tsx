import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

export function AppLayout({ children, bare }: { children: ReactNode; bare?: boolean }) {
    return (
        <div className="cabine-shell">
            <header className="cabine-topbar no-print">
                <div className="cabine-brand">
                    <div className="cabine-mark">C</div>
                    <div>
                        <strong style={{ color: '#0f172a', fontSize: '1.05rem' }}>Cabine</strong>
                        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>Avaliação corporal</div>
                    </div>
                </div>
                {!bare ? (
                    <nav className="cabine-nav">
                        <NavLink to="/admin/avaliacao" end>Avaliação</NavLink>
                        <NavLink to="/admin/oximetria">Oximetria</NavLink>
                        <NavLink to="/admin/pessoas">Pessoas</NavLink>
                        <NavLink to="/admin/balancas">Balanças</NavLink>
                    </nav>
                ) : null}
            </header>
            {children}
        </div>
    );
}
