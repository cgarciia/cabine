import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { apiErrorMessage, fetchPersonBloodPressure, fetchPersonForms, fetchPersonMeasurements, fetchPersonOximeter } from '../../api';
import {
    healthViewFromPayload,
    mentalViewFromPayload,
    SessionReport,
} from '../../components/SessionReport';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { formatVisitWhen, groupSavedVisits, visitSummary, type SavedVisit } from '../../utils/sessionBundles';

export function RecordsPage() {
    const navigate = useNavigate();
    const { session } = useKiosk();
    const [visits, setVisits] = useState<SavedVisit[]>([]);
    const [selected, setSelected] = useState<SavedVisit | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!session.person) return;
        setLoading(true);
        setError('');
        const personId = session.person.id;
        Promise.all([
            fetchPersonMeasurements(personId),
            fetchPersonForms(personId),
            fetchPersonOximeter(personId),
            fetchPersonBloodPressure(personId),
        ])
            .then(([measurements, forms, oximeter, bloodPressure]) => {
                const next = groupSavedVisits(measurements, forms, oximeter, bloodPressure);
                setVisits(next);
                setSelected(next[0] ?? null);
            })
            .catch((err) => setError(apiErrorMessage(err, 'Não foi possível carregar os registros.')))
            .finally(() => setLoading(false));
    }, [session.person]);

    if (!session.person) return <Navigate to="/matricula" replace />;

    const person = session.person;

    return (
        <KioskLayout activeSidebar="records">
            <div className="kiosk-report no-print">
                <h1 className="kiosk-title">Registros</h1>
                <p className="kiosk-subtitle">Histórico de relatórios salvos. Escolha uma visita para imprimir.</p>

                {loading ? <p className="kiosk-muted">Carregando...</p> : null}
                {error ? <p className="kiosk-error">{error}</p> : null}

                {!loading && visits.length === 0 ? (
                    <p className="kiosk-muted">Nenhum relatório salvo ainda.</p>
                ) : (
                    <div className="kiosk-history-list">
                        {visits.map((visit) => (
                            <button
                                key={visit.id}
                                type="button"
                                className={`kiosk-history-item${selected?.id === visit.id ? ' selected' : ''}`}
                                onClick={() => setSelected(visit)}
                            >
                                {formatVisitWhen(visit.at)}
                                <span className="kiosk-muted" style={{ display: 'block', fontWeight: 500 }}>
                                    {visitSummary(visit)}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {selected ? (
                <SessionReport
                    person={person}
                    whenLabel={formatVisitWhen(selected.at)}
                    health={selected.health ? healthViewFromPayload(selected.health.payload) : null}
                    mental={selected.mental ? mentalViewFromPayload(selected.mental.payload) : null}
                    measurement={selected.measurement}
                    oximeter={selected.oximeter}
                    bloodPressure={selected.bloodPressure}
                />
            ) : null}

            <div className="kiosk-report-actions no-print" style={{ padding: '0 0 1.5rem' }}>
                {selected ? (
                    <button type="button" className="kiosk-btn kiosk-btn-primary" onClick={() => window.print()}>
                        Imprimir relatório
                    </button>
                ) : null}
                <button type="button" className="kiosk-btn kiosk-btn-ghost" onClick={() => navigate('/menu')}>
                    <ChevronLeft size={20} strokeWidth={2.2} aria-hidden />
                    Voltar ao menu
                </button>
            </div>
        </KioskLayout>
    );
}
