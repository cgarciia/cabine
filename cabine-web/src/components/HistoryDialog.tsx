import type { MeasurementRecord } from '../types/measurement';
import type { ScalePerson } from '../types/person';
import { BodyReport } from './BodyReport';

function formatWhen(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

type Props = {
    person: ScalePerson;
    records: MeasurementRecord[];
    loading?: boolean;
    error?: string;
    selected: MeasurementRecord | null;
    onSelect: (item: MeasurementRecord) => void;
    onClose: () => void;
};

export function HistoryDialog({ person, records, loading, error, selected, onSelect, onClose }: Props) {
    const items = Array.isArray(records) ? records : [];
    const report = selected ?? items[0] ?? null;

    return (
        <div className="cabine-overlay no-print" style={{ zIndex: 60 }} onClick={onClose}>
            <div className="cabine-dialog" onClick={(event) => event.stopPropagation()}>
                <div className="cabine-dialog-head">
                    <div>
                        <p className="cabine-kicker">Histórico</p>
                        <h2 style={{ margin: '4px 0 0', fontSize: '1.6rem' }}>{person.name}</h2>
                    </div>
                    <button type="button" className="cabine-btn cabine-btn-ghost" onClick={onClose}>
                        Fechar
                    </button>
                </div>

                {loading ? <p style={{ color: '#64748b' }}>Carregando avaliações...</p> : null}
                {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}

                {!loading && items.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '1.05rem' }}>
                        Ainda não há relatório salvo para esta pessoa. A avaliação é gravada quando a leitura termina.
                    </p>
                ) : (
                    <div className="cabine-history-layout">
                        <div className="cabine-history-list">
                            {items.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    className={`cabine-history-item${report?.id === item.id ? ' selected' : ''}`}
                                    onClick={() => onSelect(item)}
                                >
                                    <div style={{ fontWeight: 800 }}>{item.peso_kg.toFixed(1)} kg</div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>
                                        {formatWhen(item.created_at)}
                                        {item.metricas?.gordura_pct != null ? ` · gordura ${item.metricas.gordura_pct}%` : ''}
                                    </div>
                                </button>
                            ))}
                        </div>
                        {report ? (
                            <div className="cabine-history-report">
                                <BodyReport
                                    personName={person.name}
                                    scaleName={report.scale_name}
                                    heightCm={String(report.height_cm)}
                                    age={String(report.age)}
                                    pesoKg={report.peso_kg}
                                    metrics={report.metricas}
                                    supportsBia={report.adapter === 'ble_icomon'}
                                    weightOnly={report.adapter === 'ble_icomon' && !report.completo}
                                    saved
                                />
                                <button
                                    type="button"
                                    className="cabine-btn cabine-btn-primary"
                                    style={{ marginTop: 12 }}
                                    onClick={() => window.print()}
                                >
                                    Imprimir
                                </button>
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}
