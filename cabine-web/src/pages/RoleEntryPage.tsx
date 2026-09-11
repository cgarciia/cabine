import { useNavigate } from 'react-router-dom';

import { AppLayout } from '../components/AppLayout';
import { useRole } from '../role/RoleContext';

export function RoleEntryPage() {
    const navigate = useNavigate();
    const { setRole } = useRole();

    function enter(role: 'patient' | 'clinician') {
        setRole(role);
        navigate(role === 'clinician' ? '/clinico' : '/', { replace: true });
    }

    return (
        <AppLayout bare>
            <div className="cabine-stage">
                <div className="cabine-hero">
                    <p className="cabine-kicker">Cabine de saúde</p>
                    <h1 style={{ margin: '8px 0 0', fontSize: '1.85rem' }}>Como você quer entrar?</h1>
                    <p style={{ margin: '10px 0 0', color: '#64748b', maxWidth: 560 }}>
                        O paciente vê só os módulos da visita e um resumo de cuidados. O clínico vê cadastros, equipamentos e o relatório completo.
                    </p>
                    <div className="cabine-role-grid">
                        <button type="button" className="cabine-module-card cabine-role-card" onClick={() => enter('patient')}>
                            <p className="cabine-kicker">Visitante</p>
                            <h2>Paciente</h2>
                            <p>Questionários e bioimpedância. Sem classificações na tela. Sem acesso a relatórios de outras pessoas.</p>
                        </button>
                        <button type="button" className="cabine-module-card cabine-role-card" onClick={() => enter('clinician')}>
                            <p className="cabine-kicker">Equipe</p>
                            <h2>Clínico</h2>
                            <p>Pessoas, balanças e relatórios completos de cada avaliação, incluindo faixas e composição corporal.</p>
                        </button>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
