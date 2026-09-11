import { useNavigate } from 'react-router-dom';

import { AppLayout } from '../components/AppLayout';
import { useRole } from '../role/RoleContext';
import { resetSession } from '../session/cabineSession';
import { loadCurrentPersonId } from '../session/currentPerson';

export function SettingsPage() {
    const navigate = useNavigate();
    const { role, signOut } = useRole();

    return (
        <AppLayout>
            <div className="cabine-stage">
                <div className="cabine-hero cabine-flow">
                    <p className="cabine-kicker">Configurações</p>
                    <h1 style={{ margin: '8px 0 12px', fontSize: '1.7rem' }}>Este tablet</h1>
                    <p className="cabine-sub">
                        Perfil atual: <strong>{role === 'clinician' ? 'clínico' : 'paciente'}</strong>.
                    </p>
                    <div className="cabine-flow-actions">
                        <button
                            type="button"
                            className="cabine-btn"
                            onClick={() => {
                                resetSession(loadCurrentPersonId());
                                navigate(role === 'clinician' ? '/clinico' : '/');
                            }}
                        >
                            Limpar sessão dos questionários
                        </button>
                        <button
                            type="button"
                            className="cabine-btn pri"
                            onClick={() => {
                                signOut();
                                navigate('/entrar', { replace: true });
                            }}
                        >
                            Trocar perfil (sair)
                        </button>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
