import { Link, NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useRole } from '../role/RoleContext';

export function AppLayout({ children, bare }: { children: ReactNode; bare?: boolean }) {
    const { role } = useRole();
    const home = role === 'clinician' ? '/clinico' : role === 'patient' ? '/' : '/entrar';

    return (
        <div className="cabine-shell">
            <header className="cabine-topbar no-print">
                <Link to={home} className="cabine-brand" style={{ textDecoration: 'none' }}>
                    <div className="cabine-mark">C</div>
                    <div>
                        <strong style={{ color: '#0f172a', fontSize: '1.05rem' }}>Cabine</strong>
                        <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                            {role === 'clinician' ? 'Área clínica' : 'Saúde no trabalho'}
                        </div>
                    </div>
                </Link>
                {!bare && role === 'patient' ? (
                    <nav className="cabine-nav">
                        <NavLink to="/configuracoes">Configurações</NavLink>
                    </nav>
                ) : null}
                {!bare && role === 'clinician' ? (
                    <nav className="cabine-nav">
                        <NavLink to="/clinico">Início</NavLink>
                        <NavLink to="/pessoas">Pessoas</NavLink>
                        <NavLink to="/balancas">Balanças</NavLink>
                        <NavLink to="/clinico/oximetria">Oximetria</NavLink>
                        <NavLink to="/clinico/sessao">Sessão</NavLink>
                        <NavLink to="/configuracoes">Configurações</NavLink>
                    </nav>
                ) : null}
            </header>
            {children}
        </div>
    );
}

export default AppLayout;
