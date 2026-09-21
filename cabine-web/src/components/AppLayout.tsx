import { Activity, HeartPulse, Scale, Stethoscope, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

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
                        <NavLink to="/admin/avaliacao" end>
                            <Stethoscope size={16} strokeWidth={2} aria-hidden />
                            Avaliação
                        </NavLink>
                        <NavLink to="/admin/oximetria">
                            <Activity size={16} strokeWidth={2} aria-hidden />
                            Oximetria
                        </NavLink>
                        <NavLink to="/admin/pressao">
                            <HeartPulse size={16} strokeWidth={2} aria-hidden />
                            Pressão
                        </NavLink>
                        <NavLink to="/admin/pessoas">
                            <Users size={16} strokeWidth={2} aria-hidden />
                            Pessoas
                        </NavLink>
                        <NavLink to="/admin/balancas">
                            <Scale size={16} strokeWidth={2} aria-hidden />
                            Balanças
                        </NavLink>
                    </nav>
                ) : null}
            </header>
            {children}
        </div>
    );
}
