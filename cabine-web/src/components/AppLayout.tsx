import { Activity, HeartPulse, LogOut, Scale, Stethoscope, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { isMVP1, isMVP2 } from '../config/mvp';
import { useKiosk } from '../kiosk/KioskContext';
import { clearAccessSession } from '../session/authSession';

export function AppLayout({ children, bare }: { children: ReactNode; bare?: boolean }) {
    const navigate = useNavigate();
    const { clearSession } = useKiosk();

    function signOut() {
        clearSession();
        clearAccessSession();
        navigate('/admin/login', { replace: true });
    }

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
                        {/* MVP 1 — Bioimpedância */}
                        {isMVP1 && (
                            <NavLink to="/admin/avaliacao" end>
                                <Stethoscope size={16} strokeWidth={2} aria-hidden />
                                Avaliação
                            </NavLink>
                        )}

                        {/* Compartilhado — Oximetria */}
                        <NavLink to="/admin/oximetria">
                            <Activity size={16} strokeWidth={2} aria-hidden />
                            Oximetria
                        </NavLink>

                        {/* MVP 2 — Pressão */}
                        {isMVP2 && (
                            <NavLink to="/admin/pressao">
                                <HeartPulse size={16} strokeWidth={2} aria-hidden />
                                Pressão
                            </NavLink>
                        )}

                        {/* Sempre — Pessoas */}
                        <NavLink to="/admin/pessoas">
                            <Users size={16} strokeWidth={2} aria-hidden />
                            Pessoas
                        </NavLink>

                        {/* MVP 1 — Gestão de balanças */}
                        {isMVP1 && (
                            <NavLink to="/admin/balancas">
                                <Scale size={16} strokeWidth={2} aria-hidden />
                                Balanças
                            </NavLink>
                        )}

                        <button type="button" onClick={signOut}>
                            <LogOut size={16} strokeWidth={2} aria-hidden />
                            Sair
                        </button>
                    </nav>
                ) : null}
            </header>
            {children}
        </div>
    );
}
