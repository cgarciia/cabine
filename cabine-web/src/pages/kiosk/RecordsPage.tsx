import { ChevronLeft, ChevronRight, Printer, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { apiErrorMessage, fetchPersonBloodPressure, fetchPersonForms, fetchPersonMeasurements, fetchPersonOximeter } from '../../api';
import {
    healthViewFromPayload,
    mentalViewFromPayload,
    SessionReport,
} from '../../components/SessionReport';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { formatWhen } from '../../utils/formatWhen';
import { groupSavedVisits, visitSummary, type SavedVisit } from '../../utils/sessionBundles';

export function RecordsPage() {
    const navigate = useNavigate();
    const { session } = useKiosk();
    const [visits, setVisits] = useState<SavedVisit[]>([]);
    const [selected, setSelected] = useState<SavedVisit | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!session.person) return;
        let cancelled = false;
        const personId = session.person.id;

        queueMicrotask(() => {
            if (cancelled) return;
            setLoading(true);
            setError('');
        });

        Promise.all([
            fetchPersonMeasurements(personId),
            fetchPersonForms(personId),
            fetchPersonOximeter(personId),
            fetchPersonBloodPressure(personId),
        ])
            .then(([measurements, forms, oximeter, bloodPressure]) => {
                if (cancelled) return;
                const next = groupSavedVisits(measurements, forms, oximeter, bloodPressure);
                setVisits(next);
                setSelected(null);
            })
            .catch((err) => {
                if (!cancelled) setError(apiErrorMessage(err, 'Não foi possível carregar os registros.'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [session.person]);

    useEffect(() => {
        if (!selected) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        modalRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            const index = visits.findIndex((visit) => visit.id === selected.id);
            if (event.key === 'Escape') setSelected(null);
            if (event.key === 'ArrowLeft' && index > 0) {
                event.preventDefault();
                setSelected(visits[index - 1]);
            }
            if (event.key === 'ArrowRight' && index < visits.length - 1) {
                event.preventDefault();
                setSelected(visits[index + 1]);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [selected, visits]);

    if (!session.person) return <Navigate to="/matricula" replace />;

    const person = session.person;
    const selectedIndex = selected
        ? visits.findIndex((visit) => visit.id === selected.id)
        : -1;
    const previousVisit = selectedIndex > 0 ? visits[selectedIndex - 1] : undefined;
    const nextVisit = selectedIndex >= 0 ? visits[selectedIndex + 1] : undefined;

    return (
        <KioskLayout activeSidebar="records">
            <div className="kiosk-report no-print">
                <h1 className="kiosk-title">Registros</h1>
                <p className="kiosk-subtitle">Escolha uma visita para ver ou imprimir.</p>

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
                                className="kiosk-history-item"
                                onClick={() => setSelected(visit)}
                            >
                                {formatWhen(visit.at)}
                                <span className="kiosk-history-summary">
                                    {visitSummary(visit)}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {selected ? (
                <div className="kiosk-record-modal-backdrop" onClick={() => setSelected(null)}>
                    <div
                        ref={modalRef}
                        className="kiosk-record-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="record-modal-title"
                        tabIndex={-1}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="kiosk-record-modal-toolbar no-print">
                            <button
                                type="button"
                                className="kiosk-record-modal-nav"
                                disabled={!previousVisit}
                                onClick={() => previousVisit && setSelected(previousVisit)}
                                aria-label="Ver registro anterior"
                                title="Registro anterior"
                            >
                                <ChevronLeft size={20} aria-hidden />
                            </button>

                            <div className="kiosk-record-modal-title">
                                <strong id="record-modal-title">Registro da sessão</strong>
                                <span>{formatWhen(selected.at)}</span>
                            </div>

                            <div className="kiosk-record-modal-actions">
                                <button type="button" className="kiosk-btn kiosk-btn-primary" onClick={() => window.print()}>
                                    <Printer size={14} aria-hidden />
                                    Imprimir
                                </button>
                                <button
                                    type="button"
                                    className="kiosk-btn kiosk-btn-ghost"
                                    onClick={() => setSelected(null)}
                                >
                                    <X size={14} aria-hidden />
                                    Fechar
                                </button>
                            </div>

                            <button
                                type="button"
                                className="kiosk-record-modal-nav"
                                disabled={!nextVisit}
                                onClick={() => nextVisit && setSelected(nextVisit)}
                                aria-label="Ver próximo registro"
                                title="Próximo registro"
                            >
                                <ChevronRight size={20} aria-hidden />
                            </button>
                        </div>

                        <div className="kiosk-record-modal-body">
                            <SessionReport
                                person={person}
                                whenLabel={formatWhen(selected.at)}
                                health={selected.health ? healthViewFromPayload(selected.health.payload) : null}
                                mental={selected.mental ? mentalViewFromPayload(selected.mental.payload) : null}
                                measurement={selected.measurement}
                                oximeter={selected.oximeter}
                                bloodPressure={selected.bloodPressure}
                                wristBloodPressure={selected.wristBloodPressure}
                            />
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="kiosk-report-actions no-print kiosk-records-actions">
                <button type="button" className="kiosk-btn kiosk-btn-ghost" onClick={() => navigate('/menu')}>
                    <ChevronLeft size={20} strokeWidth={2.2} aria-hidden />
                    Voltar ao menu
                </button>
            </div>
        </KioskLayout>
    );
}
