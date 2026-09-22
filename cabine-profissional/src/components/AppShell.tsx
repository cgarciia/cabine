import { LogOut, Stethoscope } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { clearAccessSession, getStoredUser } from '../session/auth';

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const user = getStoredUser();

  function logout() {
    clearAccessSession();
    navigate('/login');
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/pacientes" className="brand">
          <span className="brand-mark" aria-hidden>
            <Stethoscope size={18} strokeWidth={2} />
          </span>
          <span>
            Cabine
            <span>Portal do profissional</span>
          </span>
        </Link>
        <div className="topbar-meta">
          <div>
            {user?.full_name || user?.email}
            {user?.crm ? ` · CRM ${user.crm}` : ''}
          </div>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            <LogOut size={16} strokeWidth={2} aria-hidden />
            Sair
          </button>
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
