import type { ScaleMetrics } from '../types/measurement';

type Card = {
    label: string;
    value: string;
    hint?: string;
    status?: string;
};

function statusColor(status?: string) {
    if (status === 'saudavel') return '#0F766E';
    if (status === 'alto') return '#B45309';
    if (status === 'baixo') return '#0369A1';
    return '#64748B';
}

function statusLabel(status?: string) {
    if (status === 'saudavel') return 'Adequado';
    if (status === 'alto') return 'Acima';
    if (status === 'baixo') return 'Abaixo';
    return '';
}

function fmt(value?: number, digits = 1) {
    if (value == null || Number.isNaN(value)) return null;
    return value.toFixed(digits);
}

export function reportCards(metrics: ScaleMetrics | null, pesoKg: number | null, supportsBia: boolean): Card[] {
    const cards: Card[] = [];
    if (pesoKg != null) {
        cards.push({ label: 'Peso', value: `${pesoKg.toFixed(1)} kg` });
    }
    if (!metrics) return cards;

    const imc = fmt(metrics.imc);
    if (imc) cards.push({ label: 'IMC', value: imc, status: metrics.imc_status, hint: 'Índice de massa corporal' });

    if (supportsBia) {
        const fat = fmt(metrics.gordura_pct);
        if (fat) {
            cards.push({
                label: 'Gordura corporal',
                value: `${fat}%`,
                hint: metrics.gordura_kg != null ? `${fmt(metrics.gordura_kg)} kg` : undefined,
                status: metrics.gordura_pct_status,
            });
        }
        const lean = fmt(metrics.massa_magra_kg);
        if (lean) cards.push({ label: 'Massa magra', value: `${lean} kg` });
        const water = fmt(metrics.agua_pct);
        if (water) {
            cards.push({
                label: 'Água corporal',
                value: `${water}%`,
                hint: metrics.agua_kg != null ? `${fmt(metrics.agua_kg)} kg` : undefined,
                status: metrics.agua_status,
            });
        }
        const muscle = fmt(metrics.musculo_esqueletico_kg);
        if (muscle) {
            cards.push({
                label: 'Músculo',
                value: `${muscle} kg`,
                hint: metrics.musculo_pct != null ? `${fmt(metrics.musculo_pct)}%` : undefined,
            });
        }
        if (metrics.gordura_visceral != null) {
            cards.push({ label: 'Gordura visceral', value: String(metrics.gordura_visceral), hint: 'Nível' });
        }
        if (metrics.idade_corporal != null) {
            cards.push({ label: 'Idade corporal', value: `${metrics.idade_corporal} anos` });
        }
        const bone = fmt(metrics.osso_kg);
        if (bone) cards.push({ label: 'Massa óssea', value: `${bone} kg` });
    }

    if (metrics.tmb_kcal != null) {
        cards.push({ label: 'Metabolismo', value: `${Math.round(metrics.tmb_kcal)} kcal`, hint: 'Gasto em repouso' });
    }
    const ideal = fmt(metrics.peso_ideal_kg);
    if (ideal) {
        cards.push({
            label: 'Peso de referência',
            value: `${ideal} kg`,
            hint: metrics.controle_peso_kg != null
                ? `${metrics.controle_peso_kg > 0 ? '+' : ''}${fmt(metrics.controle_peso_kg)} kg`
                : undefined,
        });
    }
    return cards;
}

type Props = {
    personName: string;
    scaleName: string;
    heightCm: string;
    age: string;
    pesoKg: number | null;
    metrics: ScaleMetrics | null;
    supportsBia: boolean;
    weightOnly?: boolean;
    saved?: boolean;
};

export function BodyReport({
    personName,
    scaleName,
    heightCm,
    age,
    pesoKg,
    metrics,
    supportsBia,
    weightOnly,
    saved,
}: Props) {
    const cards = reportCards(metrics, pesoKg, supportsBia && !weightOnly);
    const score = supportsBia && !weightOnly ? metrics?.score : undefined;

    return (
        <div id="scale-report" className="cabine-report">
            <div className="cabine-report-head">
                <div>
                    <p className="cabine-kicker">Relatório de avaliação</p>
                    <h2>{personName || 'Convidado'}</h2>
                    <p className="cabine-report-meta">
                        {heightCm} cm · {age} anos · {scaleName}
                    </p>
                </div>
                {score != null ? (
                    <div className="cabine-score" aria-label={`Pontuação ${score} de 100`}>
                        <strong>{score}</strong>
                        <span>/100</span>
                    </div>
                ) : null}
            </div>

            {saved ? (
                <p className="cabine-saved-pill">Avaliação salva no histórico desta pessoa</p>
            ) : null}

            {weightOnly ? (
                <p className="cabine-note">
                    Nesta vez a balança registrou o peso. Para a composição completa, suba já segurando a barra
                    com as duas mãos e os pés descalços no centro da plataforma.
                </p>
            ) : null}

            <div className="cabine-metric-grid">
                {cards.map((card) => (
                    <article key={card.label} className="cabine-metric-card">
                        <div className="cabine-metric-label">
                            <span>{card.label}</span>
                            {card.status ? (
                                <span style={{ color: statusColor(card.status), fontWeight: 700 }}>
                                    {statusLabel(card.status)}
                                </span>
                            ) : null}
                        </div>
                        <div className="cabine-metric-value">{card.value}</div>
                        {card.hint ? <div className="cabine-metric-hint">{card.hint}</div> : null}
                    </article>
                ))}
            </div>
        </div>
    );
}
