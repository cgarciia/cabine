import type { OximeterReading } from '../types/oximeter';
import type { ScalePerson } from '../types/person';

function formatWhen(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

type Props = {
    person: ScalePerson;
    records: OximeterReading[];
    loading?: boolean;
    error?: string;
    onClose: () => void;
};

export function OximeterHistoryDialog({ person, records, loading, error, onClose }: Props) {
    const items = Array.isArray(records) ? records : [];

    return (
        <div className="cabine-overlay" style={{ zIndex: 60 }} onClick={onClose}>
            <div className="cabine-dialog" onClick={(event) => event.stopPropagation()}>
                <div className="cabine-dialog-head no-print">
                    <div>
                        <p className="cabine-kicker">Oximetria</p>
                        <h2 style={{ margin: '4px 0 0', fontSize: '1.6rem' }}>{person.name}</h2>
                    </div>
                    <button type="button" className="cabine-btn cabine-btn-ghost" onClick={onClose}>
                        Fechar
                    </button>
                </div>

                {loading ? <p style={{ color: '#64748b' }}>Carregando leituras...</p> : null}
                {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}

                {!loading && items.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '1.05rem' }}>
                        Ainda não há oximetria salva para esta pessoa.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {items.map((item) => (
                            <div key={item.id} className="cabine-history-item" style={{ cursor: 'default' }}>
                                <div style={{ fontWeight: 800 }}>
                                    SpO2 {item.spo2_pct}% · {item.pulse_bpm} bpm
                                </div>
                                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>
                                    {formatWhen(item.created_at)} · {item.device_name}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
