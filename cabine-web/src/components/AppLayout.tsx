import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

export function AppLayout({ children }: { children: ReactNode }) {
    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #f6f8fd 0%, #f1f5f9 100%)',
                fontFamily:
                    '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
        >
            <header
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem 1.5rem',
                    maxWidth: '960px',
                    margin: '0 auto',
                }}
            >
                <div>
                    <strong style={{ color: '#1E293B', fontSize: '1.05rem' }}>Cabine</strong>
                    <div style={{ color: '#64748B', fontSize: '0.85rem' }}>Central de pesagem</div>
                </div>
                <nav style={{ display: 'flex', gap: '8px' }}>
                    <NavLink
                        to="/"
                        style={({ isActive }) => ({
                            textDecoration: 'none',
                            padding: '8px 14px',
                            borderRadius: '999px',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            color: isActive ? '#1E40AF' : '#475569',
                            background: isActive ? '#dbeafe' : '#fff',
                            border: '1px solid #e2e8f0',
                        })}
                    >
                        Pesagem
                    </NavLink>
                    <NavLink
                        to="/balancas"
                        style={({ isActive }) => ({
                            textDecoration: 'none',
                            padding: '8px 14px',
                            borderRadius: '999px',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            color: isActive ? '#1E40AF' : '#475569',
                            background: isActive ? '#dbeafe' : '#fff',
                            border: '1px solid #e2e8f0',
                        })}
                    >
                        Cadastro
                    </NavLink>
                </nav>
            </header>
            {children}
        </div>
    );
}
