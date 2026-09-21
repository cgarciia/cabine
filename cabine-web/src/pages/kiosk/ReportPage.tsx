import { ChevronLeft } from 'lucide-react';
import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { fetchPersonMeasurements, fetchPersonOximeter } from '../../api';
import { gateItemsFromScores, SessionReport } from '../../components/SessionReport';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import type { OximeterReading } from '../../types/oximeter';

export function ReportPage() {
    const navigate = useNavigate();
    const { session, setLastMeasurement, setLastOximeter, hasReportData } = useKiosk();
    const personId = session.person?.id;
    const measurementId = session.lastMeasurement?.id;
    const oximeterId = session.lastOximeter?.id;
    const oximeterWave = session.lastOximeter?.waveform;

    useEffect(() => {
        if (!personId || !measurementId) return;
        let cancelled = false;
        fetchPersonMeasurements(personId)
            .then((rows) => {
                if (cancelled || !rows[0]) return;
                const match = rows.find((row) => row.id === measurementId) ?? rows[0];
                setLastMeasurement(match);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [personId, measurementId, setLastMeasurement]);

    useEffect(() => {
        if (!personId) return;
        let cancelled = false;
        fetchPersonOximeter(personId)
            .then((rows) => {
                if (cancelled || !rows[0]) return;
                const match = oximeterId
                    ? rows.find((row) => row.id === oximeterId)
                    : recentRow(rows[0]);
                if (!match) return;
                setLastOximeter({ ...match, waveform: oximeterWave ?? match.waveform });
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [personId, oximeterId, oximeterWave, setLastOximeter]);

    if (!session.person) return <Navigate to="/matricula" replace />;
    if (!hasReportData) return <Navigate to="/menu" replace />;

    const person = session.person;
    const generalHealth = session.generalHealth;
    const mental = session.mentalHealth;

    return (
        <KioskLayout>
            <SessionReport
                person={person}
                whenLabel={new Date().toLocaleString('pt-BR')}
                health={generalHealth}
                mental={mental ? {
                    accepted: mental.accepted,
                    refused: mental.refused,
                    safetyTriggered: mental.safetyTriggered,
                    results: mental.results,
                    instrumentLog: mental.instrumentLog,
                    gateItems: mental.gate.length ? gateItemsFromScores(mental.gate) : [],
                } : null}
                measurement={session.lastMeasurement}
                oximeter={session.lastOximeter}
                bloodPressure={session.lastBloodPressure}
            />
            <div className="kiosk-report-actions no-print" style={{ padding: '0 0 1.5rem' }}>
                <button type="button" className="kiosk-btn kiosk-btn-primary" onClick={() => window.print()}>
                    Imprimir
                </button>
                <button type="button" className="kiosk-btn kiosk-btn-ghost" onClick={() => navigate('/menu')}>
                    <ChevronLeft size={20} strokeWidth={2.2} aria-hidden />
                    Voltar ao menu
                </button>
            </div>
        </KioskLayout>
    );
}

function recentRow(row: OximeterReading): OximeterReading | undefined {
    const t = Date.parse(row.created_at);
    if (!Number.isFinite(t) || Date.now() - t > 45 * 60 * 1000) return undefined;
    return row;
}
