import type { BloodPressureReading } from '../types/bloodPressure';
import type { FormSubmission } from '../types/form';
import { hasBiaImpedances, type MeasurementRecord } from '../types/measurement';
import type { OximeterReading } from '../types/oximeter';

const WINDOW_MS = 45 * 60 * 1000;

export type SavedVisit = {
    id: string;
    at: string;
    seedT: number;
    visitId: string | null;
    measurement: MeasurementRecord | null;
    oximeter: OximeterReading | null;
    bloodPressure: BloodPressureReading | null;
    health: FormSubmission | null;
    mental: FormSubmission | null;
};

type Piece = {
    t: number;
    at: string;
    visitId: string | null;
    kind: 'measurement' | 'oximeter' | 'bloodPressure' | 'health' | 'mental';
    measurement?: MeasurementRecord;
    oximeter?: OximeterReading;
    bloodPressure?: BloodPressureReading;
    form?: FormSubmission;
};

export function groupSavedVisits(
    measurements: MeasurementRecord[],
    forms: FormSubmission[],
    oximeter: OximeterReading[],
    bloodPressure: BloodPressureReading[] = [],
): SavedVisit[] {
    const pieces: Piece[] = [];

    for (const item of measurements) {
        pieces.push({
            t: timeOf(item.created_at),
            at: item.created_at,
            visitId: item.visit_id ?? null,
            kind: 'measurement',
            measurement: item,
        });
    }
    for (const item of oximeter) {
        pieces.push({
            t: timeOf(item.created_at),
            at: item.created_at,
            visitId: item.visit_id ?? null,
            kind: 'oximeter',
            oximeter: item,
        });
    }
    for (const item of bloodPressure) {
        pieces.push({
            t: timeOf(item.measured_at || item.created_at),
            at: item.measured_at || item.created_at,
            visitId: item.visit_id ?? null,
            kind: 'bloodPressure',
            bloodPressure: item,
        });
    }
    for (const item of forms) {
        if (item.module !== 'health' && item.module !== 'mental') continue;
        pieces.push({
            t: timeOf(item.created_at),
            at: item.created_at,
            visitId: item.visit_id ?? null,
            kind: item.module,
            form: item,
        });
    }

    pieces.sort((a, b) => b.t - a.t);

    const visits: SavedVisit[] = [];
    const byVisitId = new Map<string, SavedVisit>();

    for (const piece of pieces) {
        if (piece.visitId) {
            let match = byVisitId.get(piece.visitId);
            if (!match) {
                match = emptyVisit(piece);
                byVisitId.set(piece.visitId, match);
                visits.push(match);
            }
            assignPiece(match, piece);
            continue;
        }

        const match = visits.find((visit) => !visit.visitId && belongsTo(visit, piece.t));
        if (match) {
            assignPiece(match, piece);
        } else {
            const visit = emptyVisit(piece);
            assignPiece(visit, piece);
            visits.push(visit);
        }
    }

    visits.sort((a, b) => timeOf(b.at) - timeOf(a.at));
    return visits;
}

export function visitSummary(visit: SavedVisit): string {
    const parts: string[] = [];
    if (visit.health) parts.push('Saúde geral');
    if (visit.mental) parts.push('Saúde mental');
    if (visit.measurement) parts.push(`${visit.measurement.weight_kg.toFixed(1)} kg`);
    if (visit.oximeter) parts.push(`SpO₂ ${visit.oximeter.spo2_pct}%`);
    if (visit.bloodPressure) {
        parts.push(`${visit.bloodPressure.sys_mmhg}/${visit.bloodPressure.dia_mmhg} mmHg`);
    }
    return parts.join(' · ') || 'Relatório';
}

function emptyVisit(piece: Piece): SavedVisit {
    return {
        id: piece.visitId ?? piece.measurement?.id ?? piece.oximeter?.id ?? piece.bloodPressure?.id ?? piece.form?.id ?? String(piece.t),
        at: piece.at,
        seedT: piece.t,
        visitId: piece.visitId,
        measurement: null,
        oximeter: null,
        bloodPressure: null,
        health: null,
        mental: null,
    };
}

function belongsTo(visit: SavedVisit, t: number): boolean {
    return Math.abs(visit.seedT - t) <= WINDOW_MS;
}

function assignPiece(visit: SavedVisit, piece: Piece) {
    if (piece.kind === 'measurement' && piece.measurement) {
        visit.measurement = preferMeasurement(visit.measurement, piece.measurement);
    } else if (piece.kind === 'oximeter' && piece.oximeter && !visit.oximeter) {
        visit.oximeter = piece.oximeter;
    } else if (piece.kind === 'bloodPressure' && piece.bloodPressure && !visit.bloodPressure) {
        visit.bloodPressure = piece.bloodPressure;
    } else if (piece.kind === 'health' && piece.form && !visit.health) {
        visit.health = piece.form;
    } else if (piece.kind === 'mental' && piece.form && !visit.mental) {
        visit.mental = piece.form;
    }
    if (timeOf(piece.at) > timeOf(visit.at)) visit.at = piece.at;
}

function preferMeasurement(current: MeasurementRecord | null, incoming: MeasurementRecord): MeasurementRecord {
    if (!current) return incoming;
    const currentBia = current.complete || hasBiaImpedances(current.impedances_ohm);
    const incomingBia = incoming.complete || hasBiaImpedances(incoming.impedances_ohm);
    if (incomingBia && !currentBia) return incoming;
    return current;
}

function timeOf(value: string): number {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : 0;
}

export function formatVisitWhen(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
