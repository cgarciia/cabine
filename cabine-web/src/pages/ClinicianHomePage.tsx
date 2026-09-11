import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api, apiErrorMessage, fetchPersonForms } from '../api';
import { AppLayout } from '../components/AppLayout';
import { FormHistoryDialog } from '../components/FormHistoryDialog';
import type { FormSubmission } from '../types/form';
import type { ScalePerson } from '../types/person';

export function ClinicianHomePage() {
    return (
        <AppLayout>
            <div className="cabine-stage">
                <div className="cabine-hero">
                    <p className="cabine-kicker">Área clínica</p>
                    <h1 style={{ margin: '8px 0 0', fontSize: '1.85rem' }}>Acompanhamento</h1>
                    <p style={{ margin: '10px 0 0', color: '#64748b', maxWidth: 620 }}>
                        Relatórios completos, cadastro de pessoas e questionários gravados por paciente.
                    </p>
                    <div className="cabine-module-grid">
                        <Link to="/pessoas" className="cabine-module-card">
                            <p className="cabine-kicker">Pacientes</p>
                            <h2>Pessoas e relatórios</h2>
                            <p>Cadastro, bioimpedância e questionários respondidos de cada pessoa.</p>
                        </Link>
                        <Link to="/balancas" className="cabine-module-card">
                            <p className="cabine-kicker">Equipamento</p>
                            <h2>Balanças</h2>
                            <p>Cadastro e ajuste das balanças usadas na cabine.</p>
                        </Link>
                        <Link to="/clinico/oximetria" className="cabine-module-card">
                            <p className="cabine-kicker">Equipamento</p>
                            <h2>Oximetria</h2>
                            <p>Ler SpO2 e pulso do PC-60NW e gravar no cadastro da pessoa.</p>
                        </Link>
                        <Link to="/clinico/sessao" className="cabine-module-card">
                            <p className="cabine-kicker">Questionários</p>
                            <h2>Respostas por pessoa</h2>
                            <p>Abra o cadastro de uma pessoa para ver cada pergunta e cada resposta gravada.</p>
                        </Link>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}

export function ClinicianSessionPage() {
    const navigate = useNavigate();
    const [people, setPeople] = useState<ScalePerson[]>([]);
    const [selected, setSelected] = useState<ScalePerson | null>(null);
    const [records, setRecords] = useState<FormSubmission[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get<ScalePerson[]>('/people')
            .then(({ data }) => setPeople(data))
            .catch((err) => setError(apiErrorMessage(err, 'Não foi possível carregar as pessoas.')));
    }, []);

    async function openPerson(person: ScalePerson) {
        setSelected(person);
        setLoading(true);
        setError('');
        try {
            setRecords(await fetchPersonForms(person.id));
        } catch (err) {
            setError(apiErrorMessage(err, 'Não foi possível carregar os questionários.'));
        } finally {
            setLoading(false);
        }
    }

    return (
        <AppLayout>
            <div className="cabine-stage">
                <div className="cabine-hero" style={{ maxWidth: 800 }}>
                    <p className="cabine-kicker">Revisão clínica</p>
                    <h1 style={{ margin: '8px 0 12px', fontSize: '1.7rem' }}>Questionários por pessoa</h1>
                    <p className="cabine-sub">Escolha o cadastro. Só o clínico vê as respostas completas.</p>
                    {error && !selected ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {people.map((person) => (
                            <button
                                key={person.id}
                                type="button"
                                className="cabine-person-chip"
                                onClick={() => { void openPerson(person); }}
                            >
                                <div style={{ fontWeight: 700 }}>{person.name}</div>
                                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{person.height_cm} cm · {person.age} anos</div>
                            </button>
                        ))}
                    </div>
                    <div className="cabine-flow-actions">
                        <button type="button" className="cabine-btn" onClick={() => navigate('/clinico')}>Voltar</button>
                    </div>
                </div>
            </div>
            {selected ? (
                <FormHistoryDialog
                    person={selected}
                    records={records}
                    loading={loading}
                    error={error}
                    onClose={() => setSelected(null)}
                />
            ) : null}
        </AppLayout>
    );
}
