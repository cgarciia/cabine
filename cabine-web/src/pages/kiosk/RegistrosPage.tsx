import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { apiErrorMessage, fetchPersonMeasurements } from '../../api';
import { BodyReport } from '../../components/BodyReport';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import type { MeasurementRecord } from '../../types/measurement';

export function RegistrosPage() {
    const navigate = useNavigate();
    const { session } = useKiosk();
    const [records, setRecords] = useState<MeasurementRecord[]>([]);
    const [selected, setSelected] = useState<MeasurementRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!session.person) return;
        setLoading(true);
        fetchPersonMeasurements(session.person.id)
            .then((data) => {
                setRecords(data);
                setSelected(data[0] ?? null);
            })
            .catch((err) => setError(apiErrorMessage(err, 'Não foi possível carregar os registros.')))
            .finally(() => setLoading(false));
    }, [session.person]);

    if (!session.person) return <Navigate to="/matricula" replace />;

    return (
        <KioskLayout activeSidebar="registros">
            <div className="kiosk-report">
                <h1 className="kiosk-title">Registros</h1>
                <p className="kiosk-subtitle">Histórico de bioimpedância</p>

                {loading ? <p className="kiosk-muted">Carregando...</p> : null}
                {error ? <p className="kiosk-error">{error}</p> : null}

                {!loading && records.length === 0 ? (
                    <p className="kiosk-muted">Nenhuma medição registrada ainda.</p>
                ) : (
                    <div className="kiosk-history-list no-print">
                        {records.map((record) => (
                            <button
                                key={record.id}
                                type="button"
                                className={`kiosk-history-item${selected?.id === record.id ? ' selected' : ''}`}
                                onClick={() => setSelected(record)}
                            >
                                {new Date(record.created_at).toLocaleString('pt-BR')} · {record.peso_kg.toFixed(1)} kg
                            </button>
                        ))}
                    </div>
                )}

                {selected ? (
                    <div className="kiosk-report-card">
                        <BodyReport
                            personName={session.person.name}
                            scaleName={selected.scale_name}
                            heightCm={String(selected.height_cm)}
                            age={String(selected.age)}
                            sex={selected.sex}
                            peopleType={selected.people_type}
                            pesoKg={selected.peso_kg}
                            metrics={selected.metricas}
                            supportsBia={Boolean(selected.metricas)}
                            weightOnly={!selected.metricas}
                            saved
                            segmentos={selected.segmentos ?? []}
                        />
                    </div>
                ) : null}

                <button type="button" className="kiosk-back" onClick={() => navigate('/menu')}>
                    ← Voltar ao menu
                </button>
            </div>
        </KioskLayout>
    );
}
