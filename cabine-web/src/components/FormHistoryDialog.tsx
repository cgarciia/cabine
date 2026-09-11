import type { FormSubmission } from '../types/form';
import type { ScalePerson } from '../types/person';

function formatWhen(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function moduleLabel(module: string) {
    if (module === 'health') return 'Saúde geral';
    if (module === 'mental') return 'Saúde mental';
    return module;
}

type Payload = {
    title?: string;
    items?: Array<{ id?: string; text?: string; answer?: string | string[]; detail?: string }>;
    gate?: Array<{ id?: string; text?: string; answer?: string; score?: number | null }>;
    instruments?: Array<{
        instrument?: string;
        items?: Array<{ text?: string; label?: string; score?: number }>;
    }>;
    results?: Array<{ instrument?: string; band?: string; score?: number; hadA?: number; hadD?: number; tone?: string }>;
    accepted?: boolean;
    refused?: boolean;
    instrument?: string | null;
    optionalOffered?: string | null;
    optionalAccepted?: boolean | null;
    safetyTriggered?: boolean;
    duration_seconds?: number | null;
};

type Props = {
    person: ScalePerson;
    records: FormSubmission[];
    loading?: boolean;
    error?: string;
    onClose: () => void;
};

export function FormHistoryDialog({ person, records, loading, error, onClose }: Props) {
    return (
        <div className="cabine-overlay" style={{ zIndex: 60 }} onClick={onClose}>
            <div className="cabine-dialog" onClick={(event) => event.stopPropagation()}>
                <div className="cabine-dialog-head no-print">
                    <div>
                        <p className="cabine-kicker">Questionários</p>
                        <h2 style={{ margin: '4px 0 0', fontSize: '1.6rem' }}>{person.name}</h2>
                    </div>
                    <button type="button" className="cabine-btn cabine-btn-ghost" onClick={onClose}>Fechar</button>
                </div>
                {loading ? <p style={{ color: '#64748b' }}>Carregando formulários...</p> : null}
                {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
                {!loading && records.length === 0 ? (
                    <p style={{ color: '#64748b' }}>Ainda não há questionário salvo para esta pessoa.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {records.map((record) => {
                            const payload = record.payload as Payload;
                            return (
                                <section key={record.id} className="cabine-clinical-block">
                                    <h2>{moduleLabel(record.module)} · {statusLabel(record.module, record.status, payload)}</h2>
                                    <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 8 }}>{formatWhen(record.created_at)}</p>
                                    {record.module === 'mental' ? <MentalReport payload={payload} /> : <HealthReport payload={payload} />}
                                </section>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function statusLabel(module: string, status: string, payload: Payload) {
    if (module === 'mental' && payload.refused) return 'convite recusado';
    if (status === 'completed') return 'concluído';
    if (status === 'refused') return 'convite recusado';
    return status;
}

function HealthReport({ payload }: { payload: Payload }) {
    return (
        <>
            {payload.items?.map((item, index) => (
                <p key={item.id || index}>
                    {item.text} — {Array.isArray(item.answer) ? item.answer.join(', ') : item.answer || '—'}
                    {item.detail ? ` (${item.detail})` : ''}
                </p>
            ))}
        </>
    );
}

function MentalReport({ payload }: { payload: Payload }) {
    if (payload.refused) {
        return <p>A pessoa preferiu não responder o módulo nesta visita.</p>;
    }

    return (
        <>
            <div className="cabine-report-row"><span>Convite</span><span>{payload.accepted ? 'aceito' : '—'}</span></div>
            <div className="cabine-report-row"><span>Instrumento</span><span>{payload.instrument || '—'}</span></div>
            {payload.optionalOffered ? (
                <div className="cabine-report-row">
                    <span>Opcional</span>
                    <span>{payload.optionalOffered} · {payload.optionalAccepted ? 'aceito' : 'recusado'}</span>
                </div>
            ) : null}
            {payload.duration_seconds != null ? (
                <div className="cabine-report-row"><span>Duração</span><span>{payload.duration_seconds}s</span></div>
            ) : null}
            <div className="cabine-report-row">
                <span>Segurança</span>
                <span>{payload.safetyTriggered ? 'acionada' : 'não acionada'}</span>
            </div>

            <p className="cabine-kicker" style={{ marginTop: 12 }}>Entrada (P1–P4)</p>
            {payload.gate?.map((item, index) => (
                <div className="cabine-report-row" key={item.id || index}>
                    <span>{item.text}</span>
                    <span>{item.answer || '—'}{item.score != null ? ` (${item.score})` : ''}</span>
                </div>
            ))}

            {payload.instruments?.map((block) => (
                <div key={block.instrument} style={{ marginTop: 12 }}>
                    <p className="cabine-kicker">{block.instrument}</p>
                    {block.items?.map((item, index) => (
                        <p key={`${block.instrument}-${index}`}>{item.text} — {item.label}{item.score != null ? ` (${item.score})` : ''}</p>
                    ))}
                </div>
            ))}

            {payload.results?.map((result) => (
                <div className="cabine-report-row" key={result.instrument}>
                    <span>{result.instrument}</span>
                    <span>
                        {result.band}
                        {result.hadA != null ? ` · A ${result.hadA} · D ${result.hadD}` : result.score != null ? ` · ${result.score}` : ''}
                    </span>
                </div>
            ))}
        </>
    );
}
