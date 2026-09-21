import { BodyReport } from './BodyReport';
import { HeartbeatMonitor } from './HeartbeatMonitor';
import { OximeterPulsePreview } from './OximeterPulsePreview';
import { GATE_OPTIONS, GATE_QUESTIONS } from '../modules/mental/instruments';
import { patientResultCopy, pickPatientResult } from '../modules/mental/scoring';
import type { MentalInstrumentLog, MentalResult } from '../types/mental';
import { isWeightOnlyReport, type MeasurementRecord } from '../types/measurement';
import type { BloodPressureReading } from '../types/bloodPressure';
import type { OximeterReading } from '../types/oximeter';
import type { ScalePerson } from '../types/person';

function instrumentLabel(code: string): string {
    if (code === 'WHO-5') return 'Bem-estar';
    if (code === 'HAD') return 'Humor e ansiedade';
    if (code === 'AUDIT') return 'Uso de álcool';
    return code;
}

export type SessionHealthView = {
    percent?: number;
    total?: number;
    max?: number;
    label?: string;
    findings?: Array<{ code?: string; title: string; detail: string }>;
    items?: Array<{ id?: string; text: string; answer: string; detail?: string }>;
};

export type SessionMentalView = {
    refused?: boolean;
    accepted?: boolean;
    safetyTriggered?: boolean;
    gateItems?: Array<{ text: string; answer: string }>;
    results?: MentalResult[];
    instrumentLog?: MentalInstrumentLog[];
};

type Props = {
    person: Pick<ScalePerson, 'name' | 'registration'>;
    whenLabel: string;
    health?: SessionHealthView | null;
    mental?: SessionMentalView | null;
    measurement?: MeasurementRecord | null;
    oximeter?: OximeterReading | null;
    bloodPressure?: BloodPressureReading | null;
};

export function oximeterFindings(reading: OximeterReading): { title: string; detail: string }[] {
    const findings: { title: string; detail: string }[] = [];
    if (reading.spo2_pct < 90) {
        findings.push({
            title: 'Oxigenação baixa',
            detail: `Oxigenação em ${reading.spo2_pct}%. Avise o profissional da cabine.`,
        });
    } else if (reading.spo2_pct < 95) {
        findings.push({
            title: 'Oxigenação um pouco abaixo do usual',
            detail: `Oxigenação em ${reading.spo2_pct}%. Vale repetir parado e conversar se continuar assim.`,
        });
    }
    if (reading.pulse_bpm < 50 || reading.pulse_bpm > 120) {
        findings.push({
            title: 'Pulso fora da faixa comum de repouso',
            detail: `${reading.pulse_bpm} bpm.`,
        });
    }
    if (!findings.length) {
        findings.push({
            title: 'Leitura dentro de uma faixa comum em repouso',
            detail: 'Este número não substitui avaliação clínica.',
        });
    }
    return findings;
}

export function healthViewFromPayload(payload: Record<string, unknown>): SessionHealthView {
    const findings = Array.isArray(payload.findings)
        ? payload.findings.filter(isFinding)
        : [];
    const items = Array.isArray(payload.items)
        ? payload.items.filter(isHealthItem).map((item) => ({
            id: typeof item.id === 'string' ? item.id : undefined,
            text: String(item.text ?? ''),
            answer: Array.isArray(item.answer) ? item.answer.join(', ') : String(item.answer ?? ''),
            detail: typeof item.detail === 'string' ? item.detail : undefined,
        }))
        : [];
    return {
        percent: asNumber(payload.percent),
        total: asNumber(payload.total),
        max: asNumber(payload.max),
        label: typeof payload.label === 'string' ? payload.label : undefined,
        findings,
        items,
    };
}

export function mentalViewFromPayload(payload: Record<string, unknown>): SessionMentalView {
    const gate = Array.isArray(payload.gate) ? payload.gate : [];
    const instruments = Array.isArray(payload.instruments) ? payload.instruments : [];
    const results = Array.isArray(payload.results)
        ? payload.results.filter(isMentalResult)
        : [];
    return {
        refused: Boolean(payload.refused),
        accepted: Boolean(payload.accepted),
        safetyTriggered: Boolean(payload.safetyTriggered),
        gateItems: gate.map((item, index) => {
            const row = isRecord(item) ? item : {};
            return {
                text: String(row.text ?? GATE_QUESTIONS[index] ?? `Pergunta ${index + 1}`),
                answer: String(row.answer ?? ''),
            };
        }),
        results,
        instrumentLog: instruments.filter(isInstrumentLog),
    };
}

export function gateItemsFromScores(scores: number[]): Array<{ text: string; answer: string }> {
    return GATE_QUESTIONS.map((text, index) => {
        const score = scores[index];
        const option = GATE_OPTIONS.find((item) => item.score === score);
        return { text, answer: option?.label ?? '—' };
    });
}

export function SessionReport({
    person,
    whenLabel,
    health,
    mental,
    measurement,
    oximeter,
    bloodPressure,
}: Props) {
    const mentalShown = mental?.results?.length ? pickPatientResult(mental.results) : undefined;
    const hasHealth = Boolean(health && (health.items?.length || health.label || health.percent != null));
    const hasMental = Boolean(mental && (mental.accepted || mental.refused));

    return (
        <div className="kiosk-report kiosk-print-root">
            <h1 className="kiosk-title">Relatório da sessão</h1>
            <p className="kiosk-subtitle">
                {person.name}
                {person.registration ? ` · matrícula ${person.registration}` : ''}
                {' · '}
                {whenLabel}
            </p>

            <div className="kiosk-print-pair">
                {hasHealth && health ? (
                <section className="kiosk-report-card">
                    <h2>Saúde Geral</h2>
                    {health.percent != null || health.label ? (
                        <div className="kiosk-score-row">
                            {health.percent != null ? (
                                <div className="kiosk-score-value">{health.percent}%</div>
                            ) : null}
                            <div>
                                {health.label ? <div className="kiosk-score-label">{health.label}</div> : null}
                                {health.total != null && health.max != null ? (
                                    <div className="kiosk-muted">
                                        Pontuação {health.total} de {health.max}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                    <h3 className="kiosk-report-sub">Pontos de atenção</h3>
                    {(health.findings ?? []).length ? (
                        <ul className="kiosk-finding-list">
                            {(health.findings ?? []).map((item, index) => (
                                <li key={item.code ?? `${item.title}-${index}`}>
                                    <strong>{item.title}</strong>
                                    <span>{item.detail}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="kiosk-muted">Nenhum ponto de atenção destacado nesta triagem.</p>
                    )}
                    {(health.items ?? []).length ? (
                        <>
                            <h3 className="kiosk-report-sub">Respostas</h3>
                            <ol className="kiosk-qa-list">
                                {(health.items ?? []).map((item, index) => (
                                    <li key={item.id ?? `${item.text}-${index}`}>
                                        <p>{item.text}</p>
                                        <strong>{item.answer || '—'}</strong>
                                        {item.detail ? <span className="kiosk-muted">{item.detail}</span> : null}
                                    </li>
                                ))}
                            </ol>
                        </>
                    ) : null}
                </section>
            ) : null}

            {mental?.refused ? (
                <section className="kiosk-report-card">
                    <h2>Saúde Mental</h2>
                    <p className="kiosk-muted">Convite recusado nesta sessão.</p>
                </section>
            ) : null}

            {hasMental && mental?.accepted ? (
                <section className="kiosk-report-card">
                    <h2>Saúde Mental</h2>
                    {mentalShown ? (
                        <>
                            <div className="kiosk-score-label">{mentalShown.band}</div>
                            <p className="kiosk-muted">
                                {instrumentLabel(mentalShown.instrument)}
                                {mentalShown.instrument === 'HAD'
                                    ? ` · ansiedade ${mentalShown.hadA ?? '—'} · humor ${mentalShown.hadD ?? '—'}`
                                    : ` · pontuação ${mentalShown.score}`}
                            </p>
                            <h3 className="kiosk-report-sub">Pontos de atenção</h3>
                            <ul className="kiosk-finding-list">
                                {mental.safetyTriggered ? (
                                    <li>
                                        <strong>Atenção extra</strong>
                                        <span>O rastreio indica que vale conversar com um profissional de saúde com prioridade.</span>
                                    </li>
                                ) : null}
                                {(mental.results ?? [])
                                    .filter((item) => item.tone !== 'ok')
                                    .map((item) => (
                                        <li key={item.instrument}>
                                            <strong>{instrumentLabel(item.instrument)}: {item.band}</strong>
                                            <span>Pontuação {item.score}</span>
                                        </li>
                                    ))}
                                {!(mental.results ?? []).some((item) => item.tone !== 'ok') && !mental.safetyTriggered ? (
                                    <li>
                                        <strong>Sem alerta neste rastreio</strong>
                                        <span>{patientResultCopy(mental.results ?? [])}</span>
                                    </li>
                                ) : (
                                    <li>
                                        <strong>Orientação</strong>
                                        <span>{patientResultCopy(mental.results ?? [])}</span>
                                    </li>
                                )}
                            </ul>
                        </>
                    ) : (
                        <p className="kiosk-muted">Rastreio iniciado, sem instrumento concluído.</p>
                    )}

                    {(mental.gateItems ?? []).length ? (
                        <>
                            <h3 className="kiosk-report-sub">Perguntas iniciais</h3>
                            <ol className="kiosk-qa-list">
                                {(mental.gateItems ?? []).map((item, index) => (
                                    <li key={`gate-${index}`}>
                                        <p>{item.text}</p>
                                        <strong>{item.answer || '—'}</strong>
                                    </li>
                                ))}
                            </ol>
                        </>
                    ) : null}

                    {mental.instrumentLog?.map((entry) => (
                        <div key={entry.instrument} className="kiosk-print-instrument">
                            <h3 className="kiosk-report-sub">{instrumentLabel(entry.instrument)}</h3>
                            <ol className="kiosk-qa-list">
                                {entry.items.map((item) => (
                                    <li key={item.id}>
                                        <p>{item.text}</p>
                                        <strong>{item.label || '—'}</strong>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    ))}
                </section>
            ) : null}
            </div>

            {measurement ? (
                <section className="kiosk-report-card kiosk-print-wide">
                    <h2>Bioimpedância</h2>
                    <BodyReport
                        personName={person.name}
                        scaleName={measurement.scale_name}
                        heightCm={String(measurement.height_cm)}
                        age={String(measurement.age)}
                        sex={measurement.sex}
                        peopleType={measurement.people_type}
                        weightKg={measurement.weight_kg}
                        metrics={measurement.metrics}
                        supportsBia={measurement.adapter === 'ble_rm_rd2504a' || Boolean(measurement.metrics)}
                        weightOnly={isWeightOnlyReport(measurement)}
                        saved
                        segments={measurement.segments ?? []}
                        measuredAt={whenLabel}
                    />
                </section>
            ) : null}

            {oximeter ? (
                <section className="kiosk-report-card kiosk-print-wide kiosk-print-oxi">
                    <h2>Oxigenação</h2>
                    <div className="kiosk-print-oxi-row">
                        <div className="kiosk-oxi-vitals">
                            <div>
                                <span className="kiosk-muted">Oxigenação</span>
                                <strong>{oximeter.spo2_pct}%</strong>
                            </div>
                            <div>
                                <span className="kiosk-muted">Pulso</span>
                                <strong>{oximeter.pulse_bpm} bpm</strong>
                            </div>
                            {oximeter.pi_pct != null ? (
                                <div>
                                    <span className="kiosk-muted">Perfusão</span>
                                    <strong>{oximeter.pi_pct}%</strong>
                                </div>
                            ) : null}
                        </div>
                        <OximeterPulsePreview samples={oximeter.waveform} bpm={oximeter.pulse_bpm} />
                    </div>
                    <h3 className="kiosk-report-sub">Resultado</h3>
                    <ul className="kiosk-finding-list">
                        {oximeterFindings(oximeter).map((item) => (
                            <li key={item.title}>
                                <strong>{item.title}</strong>
                                <span>{item.detail}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {bloodPressure ? (
                <section className="kiosk-report-card kiosk-print-wide">
                    <h2>Pressão arterial</h2>
                    <div className="kiosk-oxi-vitals kiosk-bp-vitals">
                        <div>
                            <span className="kiosk-muted">Sistólica</span>
                            <strong>{bloodPressure.sys_mmhg}</strong>
                        </div>
                        <div>
                            <span className="kiosk-muted">Diastólica</span>
                            <strong>{bloodPressure.dia_mmhg}</strong>
                        </div>
                        <div>
                            <span className="kiosk-muted">Pulso</span>
                            <strong>{bloodPressure.pulse_bpm} bpm</strong>
                        </div>
                    </div>
                    <HeartbeatMonitor
                        bpm={bloodPressure.pulse_bpm}
                        active
                        review
                        trace={bloodPressure.ecg_mv}
                        toneLocked={Boolean(bloodPressure.ecg_mv?.length)}
                    />
                    {bloodPressure.ecg_mv?.length ? (
                        <p className="kiosk-muted">
                            Gráfico dos batimentos. Arraste para ver o registro completo.
                        </p>
                    ) : null}
                </section>
            ) : null}

            <p className="kiosk-muted" style={{ textAlign: 'center' }}>
                Este relatório é um rastreio da sessão e não substitui avaliação clínica.
            </p>
        </div>
    );
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isFinding(value: unknown): value is { code?: string; title: string; detail: string } {
    if (!isRecord(value) || typeof value.title !== 'string' || typeof value.detail !== 'string') return false;
    return true;
}

function isHealthItem(value: unknown): value is { id?: unknown; text?: unknown; answer?: unknown; detail?: unknown } {
    return isRecord(value);
}

function isMentalResult(value: unknown): value is MentalResult {
    if (!isRecord(value)) return false;
    return value.instrument === 'HAD' || value.instrument === 'AUDIT' || value.instrument === 'WHO-5';
}

function isInstrumentLog(value: unknown): value is MentalInstrumentLog {
    if (!isRecord(value)) return false;
    if (value.instrument !== 'HAD' && value.instrument !== 'AUDIT' && value.instrument !== 'WHO-5') return false;
    return Array.isArray(value.items);
}
