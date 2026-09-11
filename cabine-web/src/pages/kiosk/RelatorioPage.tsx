import { Navigate, useNavigate } from 'react-router-dom';

import { BodyReport } from '../../components/BodyReport';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';

export function RelatorioPage() {
    const navigate = useNavigate();
    const { session, hasReportData } = useKiosk();
    if (!session.person) return <Navigate to="/matricula" replace />;
    if (!hasReportData) return <Navigate to="/menu" replace />;

    const person = session.person;
    const measurement = session.lastMeasurement;
    const geral = session.saudeGeral;

    return (
        <KioskLayout>
            <div className="kiosk-report">
                <h1 className="kiosk-title">Relatório</h1>

                {geral ? (
                    <section className="kiosk-report-card">
                        <h2>Saúde Geral</h2>
                        <div className="kiosk-score-row">
                            <div className="kiosk-score-value">{geral.percent}%</div>
                            <div>
                                <div className="kiosk-score-label">{geral.label}</div>
                                <div className="kiosk-muted">
                                    Pontuação {geral.total} de {geral.max}
                                </div>
                            </div>
                        </div>
                    </section>
                ) : null}

                {measurement ? (
                    <section className="kiosk-report-card">
                        <h2>Bioimpedância</h2>
                        <BodyReport
                            personName={person.name}
                            scaleName={measurement.scale_name}
                            heightCm={String(measurement.height_cm)}
                            age={String(measurement.age)}
                            sex={measurement.sex}
                            peopleType={measurement.people_type}
                            pesoKg={measurement.peso_kg}
                            metrics={measurement.metricas}
                            supportsBia={Boolean(measurement.metricas)}
                            weightOnly={!measurement.metricas}
                            saved
                            segmentos={measurement.segmentos ?? []}
                        />
                    </section>
                ) : null}

                <p className="kiosk-muted no-print" style={{ textAlign: 'center' }}>
                    O questionário de saúde mental não exibe relatório.
                </p>

                <div className="kiosk-report-actions no-print">
                    <button type="button" className="kiosk-btn kiosk-btn-primary" onClick={() => window.print()}>
                        Imprimir
                    </button>
                    <button type="button" className="kiosk-btn kiosk-btn-ghost" onClick={() => navigate('/menu')}>
                        Sair
                    </button>
                </div>
            </div>
        </KioskLayout>
    );
}
