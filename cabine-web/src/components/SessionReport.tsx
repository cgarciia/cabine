import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
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

function mentalBadge(result: MentalResult): string {
    if (result.instrument === 'HAD') {
        return `HAD · ansiedade ${result.hadA ?? '—'} · humor ${result.hadD ?? '—'}`;
    }
    return `${result.instrument} · pontuação ${result.score}`;
}

function mentalFindingDetail(result: MentalResult): string {
    if (result.instrument === 'HAD') {
        const hadA = result.hadA ?? 0;
        const hadD = result.hadD ?? 0;
        const subscale = hadA >= hadD ? `HAD-A = ${hadA}` : `HAD-D = ${hadD}`;
        const cutoff = Math.max(hadA, hadD) >= 11 ? 11 : 8;
        return `${subscale} — acima do ponto de corte (≥ ${cutoff}). Recomenda-se acompanhamento.`;
    }
    if (result.instrument === 'AUDIT') return `AUDIT = ${result.score}. ${result.band}. Recomenda-se atenção.`;
    return `WHO-5 = ${result.score}. ${result.band}.`;
}

function formatSex(sex: string): string {
    const s = sex.toLowerCase();
    if (s === 'f' || s === 'female' || s === 'feminino') return 'Feminino';
    if (s === 'm' || s === 'male' || s === 'masculino') return 'Masculino';
    return sex;
}

export type SessionHealthView = {
    percent?: number;
    total?: number;
    max?: number;
    label?: string;
    findings?: Array<{ code?: string; title: string; detail: string }>;
    items?: Array<{ id?: string; text: string; answer: string }>;
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
    person: Pick<ScalePerson, 'name' | 'registration' | 'sex' | 'age' | 'height_cm'>;
    whenLabel: string;
    health?: SessionHealthView | null;
    mental?: SessionMentalView | null;
    measurement?: MeasurementRecord | null;
    oximeter?: OximeterReading | null;
    bloodPressure?: BloodPressureReading | null;
    wristBloodPressure?: BloodPressureReading | null;
};

function oximeterFindings(reading: OximeterReading): { title: string; detail: string }[] {
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
    wristBloodPressure,
}: Props) {
    const mentalShown = mental?.results?.length ? pickPatientResult(mental.results) : undefined;
    const hasHealth = Boolean(health && (health.items?.length || health.label || health.percent != null));
    const hasMental = Boolean(mental && (mental.accepted || mental.refused));

    const metaParts = [
        person.registration ? `Matrícula ${person.registration}` : null,
        person.sex ? formatSex(person.sex) : null,
        person.age ? `${person.age} anos` : null,
        person.height_cm ? `${person.height_cm} cm` : null,
    ].filter(Boolean) as string[];

    const bpForVitals = bloodPressure ?? wristBloodPressure;
    const hasVitals = Boolean(oximeter || bpForVitals);
    const hasPrintSummary = hasHealth || hasMental || hasVitals;
    const hasPrintWaves = Boolean(oximeter || bloodPressure?.ecg_mv?.length);
    const hasPrintQa = (health?.items?.length ?? 0) > 0 || (mental?.gateItems?.length ?? 0) > 0;

    const mentalNonOk = (mental?.results ?? []).filter((r) => r.tone !== 'ok');
    const mentalAllOk = !mental?.safetyTriggered && mentalNonOk.length === 0 && Boolean(mentalShown);

    return (
        <div className="kiosk-report kiosk-print-root">

            {/* ── Header ── */}
            <header className="rpt-header">
                <div className="rpt-brand">
                    <div className="rpt-logo-mark">CN</div>
                    <div className="rpt-brand-text">
                        <p className="rpt-brand-name">CabiNet <span className="rpt-brand-ia">IA</span></p>
                        <span className="rpt-brand-sub">Relatório de saúde</span>
                    </div>
                </div>
                <div className="rpt-patient-meta">
                    <span className="rpt-patient-name">{person.name}</span>
                    {metaParts.length > 0 && (
                        <span className="rpt-patient-detail">{metaParts.join(' · ')}</span>
                    )}
                </div>
            </header>

            {/* ── Print-only: compact 3-column summary ── */}
            {hasPrintSummary ? (
                <div className="rpt-print-summary print-only">
                    {hasHealth && health ? (
                        <section className="rpt-print-col">
                            <p className="rpt-accent-title">Saúde Geral</p>
                            {health.percent != null ? (
                                <p className="rpt-print-score">
                                    <span className="rpt-print-score-pct">{health.percent}%</span>
                                    {health.label ? <span> {health.label}</span> : null}
                                    {health.total != null && health.max != null ? (
                                        <span className="rpt-print-score-pts"> · {health.total} de {health.max} pts</span>
                                    ) : null}
                                </p>
                            ) : null}
                            {(health.findings ?? []).map((item, i) => (
                                <div key={item.code ?? i} className="rpt-print-finding">
                                    <strong>{item.title}.</strong>{' '}{item.detail}
                                </div>
                            ))}
                        </section>
                    ) : null}

                    {hasMental ? (
                        <section className="rpt-print-col">
                            <p className="rpt-accent-title">Saúde Mental</p>
                            {mental?.refused ? (
                                <p className="rpt-print-note">Convite recusado nesta sessão.</p>
                            ) : mentalShown ? (
                                <>
                                    <p className="rpt-print-mental-band">{mentalShown.band}</p>
                                    <p className="rpt-print-mental-sub">{mentalBadge(mentalShown)}</p>
                                    {mental?.safetyTriggered ? (
                                        <div className="rpt-print-finding">
                                            <strong>Atenção extra.</strong> Vale conversar com profissional de saúde com prioridade.
                                        </div>
                                    ) : null}
                                    {mentalNonOk.map((r) => (
                                        <div key={r.instrument} className="rpt-print-finding">
                                            <strong>{r.band}.</strong>{' '}{mentalFindingDetail(r)}
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <p className="rpt-print-note">Rastreio iniciado, sem instrumento concluído.</p>
                            )}
                        </section>
                    ) : null}

                    {hasVitals ? (
                        <section className="rpt-print-col">
                            <p className="rpt-accent-title">Sinais Vitais</p>
                            {oximeter ? (
                                <div className="rpt-print-vitals">
                                    <div><span>SpO₂</span><strong>{oximeter.spo2_pct}%</strong></div>
                                    <div><span>Pulso</span><strong className="rpt-print-vital-main">{oximeter.pulse_bpm} bpm</strong></div>
                                    {oximeter.pi_pct != null ? (
                                        <div><span>Perfusão periférica</span><strong>{oximeter.pi_pct}%</strong></div>
                                    ) : null}
                                </div>
                            ) : null}
                            {bpForVitals ? (
                                <div className="rpt-print-vitals">
                                    <div><span>Pressão arterial</span><strong>{bpForVitals.sys_mmhg}/{bpForVitals.dia_mmhg} mmHg</strong></div>
                                </div>
                            ) : null}
                        </section>
                    ) : null}
                </div>
            ) : null}

            {/* ── Print-only: waves side by side ── */}
            {hasPrintWaves ? (
                <div className="rpt-print-waves print-only">
                    {oximeter ? (
                        <div className="rpt-print-wave-col">
                            <p className="rpt-accent-title">Oxímetro — Onda de Pulso</p>
                            <OximeterPulsePreview samples={oximeter.waveform} bpm={oximeter.pulse_bpm} />
                        </div>
                    ) : null}
                    {bloodPressure?.ecg_mv?.length ? (
                        <div className="rpt-print-wave-col">
                            <p className="rpt-accent-title">Eletrocardiograma (ECG)</p>
                            <HeartbeatMonitor
                                bpm={bloodPressure.pulse_bpm}
                                active
                                review
                                trace={bloodPressure.ecg_mv}
                                toneLocked
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* ── Screen: Saúde Geral ── */}
            {hasHealth && health ? (
                <section className="kiosk-report-card rpt-screen-section">
                    <h2>Saúde Geral</h2>
                    {health.percent != null ? (
                        <>
                            <div className="rpt-score-row">
                                <span className="rpt-score-pct">{health.percent}%</span>
                                <div className="rpt-score-info">
                                    {health.label ? <span className="rpt-score-label">{health.label}</span> : null}
                                    {health.total != null && health.max != null ? (
                                        <span className="rpt-score-sub">{health.total} de {health.max} pontos</span>
                                    ) : null}
                                </div>
                            </div>
                            <div className="rpt-progress-bar">
                                <div className="rpt-progress-fill" style={{ width: `${health.percent}%` }} />
                            </div>
                        </>
                    ) : null}
                    {(health.findings ?? []).length ? (
                        <>
                            <hr className="rpt-divider rpt-divider--sm" />
                            <p className="rpt-accent-title">Pontos de atenção</p>
                            <div className="rpt-callout-stack">
                                {(health.findings ?? []).map((item, i) => (
                                    <div key={item.code ?? i} className="rpt-callout rpt-callout--warning">
                                        <AlertTriangle size={14} aria-hidden />
                                        <span className="rpt-c-title">{item.title}</span>
                                        <span className="rpt-c-body">{item.detail}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : null}
                    {(health.items ?? []).length ? (
                        <details className="rpt-details">
                            <summary className="rpt-summary">
                                <ChevronRight size={12} className="rpt-chevron" aria-hidden />
                                Ver respostas do questionário ({health.items?.length})
                            </summary>
                            <div className="rpt-qa">
                                {(health.items ?? []).map((item, i) => (
                                    <div key={item.id ?? i}>
                                        <small>{i + 1}. {item.text}</small>
                                        <b>{item.answer || '—'}</b>
                                    </div>
                                ))}
                            </div>
                        </details>
                    ) : null}
                </section>
            ) : null}

            {/* ── Screen: Saúde Mental ── */}
            {hasMental ? (
                <section className="kiosk-report-card rpt-screen-section">
                    <h2>Saúde Mental</h2>
                    {mental?.refused ? (
                        <p className="rpt-score-sub">Convite recusado nesta sessão.</p>
                    ) : mental?.accepted ? (
                        <>
                            {mentalShown ? (
                                <div className="rpt-mental-head">
                                    <span className="rpt-mental-band">{mentalShown.band}</span>
                                    <span className="rpt-badge">{mentalBadge(mentalShown)}</span>
                                </div>
                            ) : (
                                <p className="rpt-score-sub">Rastreio iniciado, sem instrumento concluído.</p>
                            )}
                            <div className="rpt-callout-stack">
                                {mental?.safetyTriggered ? (
                                    <div className="rpt-callout rpt-callout--warning">
                                        <AlertTriangle size={14} aria-hidden />
                                        <span className="rpt-c-title">Atenção extra</span>
                                        <span className="rpt-c-body">O rastreio indica que vale conversar com um profissional de saúde com prioridade.</span>
                                    </div>
                                ) : null}
                                {mentalNonOk.map((r) => (
                                    <div key={r.instrument} className="rpt-callout rpt-callout--warning">
                                        <AlertTriangle size={14} aria-hidden />
                                        <span className="rpt-c-title">{r.band}</span>
                                        <span className="rpt-c-body">{mentalFindingDetail(r)}</span>
                                    </div>
                                ))}
                                {mentalAllOk ? (
                                    <div className="rpt-callout rpt-callout--success">
                                        <CheckCircle2 size={14} aria-hidden />
                                        <span>{patientResultCopy(mental?.results ?? [])}</span>
                                    </div>
                                ) : null}
                            </div>
                            {(mental?.gateItems ?? []).length ? (
                                <details className="rpt-details">
                                    <summary className="rpt-summary">
                                        <ChevronRight size={12} className="rpt-chevron" aria-hidden />
                                        Ver perguntas de triagem ({mental.gateItems?.length})
                                    </summary>
                                    <div className="rpt-qa">
                                        {(mental.gateItems ?? []).map((item, i) => (
                                            <div key={`gate-${i}`}>
                                                <small>{i + 1}. {item.text}</small>
                                                <b>{item.answer || '—'}</b>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            ) : null}
                            {mental.instrumentLog?.map((entry) => (
                                <details key={entry.instrument} className="rpt-details">
                                    <summary className="rpt-summary">
                                        <ChevronRight size={12} className="rpt-chevron" aria-hidden />
                                        Ver respostas — {instrumentLabel(entry.instrument)} ({entry.items.length})
                                    </summary>
                                    <div className="rpt-qa">
                                        {entry.items.map((item, i) => (
                                            <div key={item.id}>
                                                <small>{i + 1}. {item.text}</small>
                                                <b>{item.label || '—'}</b>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            ))}
                        </>
                    ) : null}
                </section>
            ) : null}

            {/* ── Bioimpedância — screen + print ── */}
            {measurement ? (
                <section className="kiosk-report-card kiosk-print-wide rpt-bia-section">
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
                        embedded
                        segments={measurement.segments ?? []}
                        measuredAt={whenLabel}
                    />
                </section>
            ) : null}

            {/* ── Screen: Oxigenação ── */}
            {oximeter ? (
                <section className="kiosk-report-card rpt-screen-section">
                    <h2>Oxigenação</h2>
                    <div className="rpt-vital-cards">
                        <div className="rpt-vital-card">
                            <small>Oxigenação (SpO₂)</small>
                            <strong className="rpt-vital-value rpt-vital-value--success">{oximeter.spo2_pct}%</strong>
                        </div>
                        <div className="rpt-vital-card">
                            <small>Pulso</small>
                            <strong className="rpt-vital-value">{oximeter.pulse_bpm} bpm</strong>
                        </div>
                        {oximeter.pi_pct != null ? (
                            <div className="rpt-vital-card">
                                <small>Perfusão periférica</small>
                                <strong className="rpt-vital-value">{oximeter.pi_pct}%</strong>
                            </div>
                        ) : null}
                    </div>
                    <OximeterPulsePreview samples={oximeter.waveform} bpm={oximeter.pulse_bpm} />
                    <div className="rpt-callout-offset">
                        {oximeterFindings(oximeter).map((item) => {
                            const isOk = item.title === 'Leitura dentro de uma faixa comum em repouso';
                            return (
                                <div key={item.title} className={`rpt-callout ${isOk ? 'rpt-callout--success' : 'rpt-callout--warning'}`}>
                                    {isOk
                                        ? <CheckCircle2 size={14} aria-hidden />
                                        : <AlertTriangle size={14} aria-hidden />
                                    }
                                    {isOk ? (
                                        <span>{item.title}. {item.detail}</span>
                                    ) : (
                                        <>
                                            <span className="rpt-c-title">{item.title}</span>
                                            <span className="rpt-c-body">{item.detail}</span>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            ) : null}

            {/* ── Screen: Pressão arterial (ECG) ── */}
            {bloodPressure ? (
                <section className="kiosk-report-card rpt-screen-section">
                    <h2>Pressão arterial</h2>
                    <div className="rpt-vital-cards rpt-vital-cards--2">
                        <div className="rpt-vital-card">
                            <small>Sistólica</small>
                            <strong className="rpt-vital-value rpt-vital-value--info">{bloodPressure.sys_mmhg} mmHg</strong>
                        </div>
                        <div className="rpt-vital-card">
                            <small>Diastólica</small>
                            <strong className="rpt-vital-value rpt-vital-value--info">{bloodPressure.dia_mmhg} mmHg</strong>
                        </div>
                    </div>
                    <p className="rpt-bp-note">
                        Pulso{oximeter ? ' registrado na seção de oximetria' : ''} — {bloodPressure.pulse_bpm} bpm.
                    </p>
                    {bloodPressure.ecg_mv?.length ? (
                        <>
                            <p className="rpt-block-title rpt-ecg-label">Eletrocardiograma (ECG)</p>
                            <HeartbeatMonitor
                                bpm={bloodPressure.pulse_bpm}
                                active
                                review
                                trace={bloodPressure.ecg_mv}
                                toneLocked={Boolean(bloodPressure.ecg_mv?.length)}
                            />
                            <p className="rpt-ecg-note">
                                Leitura de eletrocardiograma registrada durante a medição da pressão — mostra a atividade elétrica do coração a cada batimento. Role para o lado para ver o registro completo.
                            </p>
                        </>
                    ) : null}
                </section>
            ) : null}

            {/* ── Screen: Pressão e pulso (pulso de pulso) ── */}
            {wristBloodPressure ? (
                <section className="kiosk-report-card rpt-screen-section">
                    <h2>Pressão e pulso</h2>
                    <div className="rpt-vital-cards rpt-vital-cards--2">
                        <div className="rpt-vital-card">
                            <small>Sistólica</small>
                            <strong className="rpt-vital-value rpt-vital-value--info">{wristBloodPressure.sys_mmhg} mmHg</strong>
                        </div>
                        <div className="rpt-vital-card">
                            <small>Diastólica</small>
                            <strong className="rpt-vital-value rpt-vital-value--info">{wristBloodPressure.dia_mmhg} mmHg</strong>
                        </div>
                    </div>
                    <p className="rpt-bp-note">Pulso — {wristBloodPressure.pulse_bpm} bpm.</p>
                    {wristBloodPressure.irregular_heartbeat ? (
                        <p className="rpt-ecg-note">Batimento irregular detectado nesta medição.</p>
                    ) : null}
                </section>
            ) : null}

            {/* ── Print-only: Q&A sections ── */}
            {hasPrintQa ? (
                <div className="rpt-print-qa print-only">
                    {(health?.items?.length ?? 0) > 0 ? (
                        <div className="rpt-print-qa-section">
                            <p className="rpt-accent-title">Respostas do questionário</p>
                            <ol className="rpt-print-qa-list">
                                {(health?.items ?? []).map((item, i) => (
                                    <li key={item.id ?? i}>
                                        <span>{item.text}</span>
                                        <strong>{item.answer || '—'}</strong>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    ) : null}
                    {(mental?.gateItems?.length ?? 0) > 0 ? (
                        <div className="rpt-print-qa-section">
                            <p className="rpt-accent-title">Triagem de saúde mental</p>
                            <ol className="rpt-print-qa-list">
                                {(mental?.gateItems ?? []).map((item, i) => (
                                    <li key={`gate-print-${i}`}>
                                        <span>{item.text}</span>
                                        <strong>{item.answer || '—'}</strong>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* ── Footer ── */}
            <footer className="rpt-footer">
                <p>Este relatório é um rastreio da sessão e não substitui avaliação clínica.</p>
                <p className="rpt-footer-date">Relatório gerado em {whenLabel}</p>
            </footer>
        </div>
    );
}

// ── Private helpers ──────────────────────────────────────────────────────────

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
