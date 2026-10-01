import { ChevronLeft } from 'lucide-react';
import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { fetchPersonBloodPressure, fetchPersonMeasurements, fetchPersonOximeter } from '../../api';
import { gateItemsFromScores, SessionReport } from '../../components/SessionReport';
import { useKiosk } from '../../kiosk/KioskContext';
import { KioskLayout } from '../../kiosk/KioskLayout';
import { findVisitRow, sameVisit } from '../../session/visitScope';

export function ReportPage() {
    const navigate = useNavigate();
    const { session, setLastMeasurement, setLastOximeter, setLastBloodPressure, setLastWristBloodPressure, hasReportData } = useKiosk();
    const personId = session.person?.id;
    const visitId = session.visitId;
    const measurement = sameVisit(session.lastMeasurement, visitId) ? session.lastMeasurement : null;
    const oximeter = sameVisit(session.lastOximeter, visitId) ? session.lastOximeter : null;
    const bloodPressure = sameVisit(session.lastBloodPressure, visitId) ? session.lastBloodPressure : null;
    const wristBloodPressure = sameVisit(session.lastWristBloodPressure, visitId) ? session.lastWristBloodPressure : null;
    const measurementId = measurement?.id;
    const oximeterId = oximeter?.id;
    const oximeterWave = oximeter?.waveform;
    const bloodPressureId = bloodPressure?.id;
    const bloodPressureEcg = bloodPressure?.ecg_mv;
    const wristBloodPressureId = wristBloodPressure?.id;

    useEffect(() => {
        if (session.lastMeasurement && !measurement) setLastMeasurement(null);
        if (session.lastOximeter && !oximeter) setLastOximeter(null);
        if (session.lastBloodPressure && !bloodPressure) setLastBloodPressure(null);
        if (session.lastWristBloodPressure && !wristBloodPressure) setLastWristBloodPressure(null);
    }, [
        session.lastMeasurement,
        session.lastOximeter,
        session.lastBloodPressure,
        session.lastWristBloodPressure,
        measurement,
        oximeter,
        bloodPressure,
        wristBloodPressure,
        setLastMeasurement,
        setLastOximeter,
        setLastBloodPressure,
        setLastWristBloodPressure,
    ]);

    useEffect(() => {
        if (!personId || !measurementId) return;
        let cancelled = false;
        fetchPersonMeasurements(personId)
            .then((rows) => {
                const match = findVisitRow(rows, measurementId, visitId);
                if (cancelled || !match) return;
                setLastMeasurement(match);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [personId, visitId, measurementId, setLastMeasurement]);

    useEffect(() => {
        if (!personId || !oximeterId) return;
        let cancelled = false;
        fetchPersonOximeter(personId)
            .then((rows) => {
                const match = findVisitRow(rows, oximeterId, visitId);
                if (cancelled || !match) return;
                setLastOximeter({ ...match, waveform: oximeterWave ?? match.waveform });
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [personId, visitId, oximeterId, oximeterWave, setLastOximeter]);

    useEffect(() => {
        if (!personId || !bloodPressureId) return;
        let cancelled = false;
        fetchPersonBloodPressure(personId)
            .then((rows) => {
                const match = findVisitRow(rows, bloodPressureId, visitId);
                if (cancelled || !match) return;
                setLastBloodPressure({ ...match, ecg_mv: bloodPressureEcg ?? match.ecg_mv });
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [personId, visitId, bloodPressureId, bloodPressureEcg, setLastBloodPressure]);

    useEffect(() => {
        if (!personId || !wristBloodPressureId) return;
        let cancelled = false;
        fetchPersonBloodPressure(personId)
            .then((rows) => {
                const match = findVisitRow(rows, wristBloodPressureId, visitId);
                if (cancelled || !match) return;
                setLastWristBloodPressure(match);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [personId, visitId, wristBloodPressureId, setLastWristBloodPressure]);

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
                measurement={measurement}
                oximeter={oximeter}
                bloodPressure={bloodPressure}
                wristBloodPressure={wristBloodPressure}
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
