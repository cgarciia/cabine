import type { BiaSegment, MetricHighlight, ScaleMetrics, SegKey, WlaSegment } from '../types/measurement';

type Band = 'baixo' | 'saudavel' | 'alto';

function isFemale(sex?: string) {
    const value = (sex || '').trim().toLowerCase();
    return value === 'f' || value === 'female' || value === 'feminino' || value === 'mulher';
}

function fmt(value?: number | null, digits = 1) {
    if (value == null || Number.isNaN(value)) return null;
    return value.toFixed(digits);
}

function statusLabel(status?: string) {
    if (status === 'saudavel') return 'Adequado';
    if (status === 'alto') return 'Acima';
    if (status === 'baixo') return 'Abaixo';
    return '';
}

function bandOf(value: number, low: number, high: number): Band {
    if (value < low) return 'baixo';
    if (value > high) return 'alto';
    return 'saudavel';
}

function markerPct(value: number, low: number, high: number) {
    const min = low - (high - low);
    const max = high + (high - low);
    if (value <= low) {
        const span = Math.max(low - min, 0.1);
        return Math.max(4, Math.min(28, 28 * (value - min) / span));
    }
    if (value >= high) {
        const span = Math.max(max - high, 0.1);
        return Math.max(72, Math.min(96, 72 + 28 * (value - high) / span));
    }
    return 28 + 44 * (value - low) / Math.max(high - low, 0.1);
}

/** Fat cutoffs from the BMI × fat% body-type matrix. */
function fatCuts(sex?: string) {
    return isFemale(sex) ? { lo: 18, hi: 28 } : { lo: 10, hi: 20 };
}

function kgCuts(metrics: ScaleMetrics | null | undefined, key: keyof NonNullable<ScaleMetrics['faixas_kg']>) {
    const pair = metrics?.faixas_kg?.[key];
    if (!pair || pair.length < 2 || pair[0] >= pair[1]) return null;
    return { lo: pair[0], hi: pair[1] };
}

type SegEstimate = {
    key: SegKey;
    label: string;
    kg: number;
    /** Percent of the regional standard (WLA25). */
    vsStandardPct: number;
    status: Band;
};

const SEG_ORDER: SegKey[] = ['braco_dir', 'braco_esq', 'tronco', 'perna_dir', 'perna_esq'];
const SEG_LABEL: Record<SegKey, string> = {
    braco_dir: 'Braço direito',
    braco_esq: 'Braço esquerdo',
    tronco: 'Tronco',
    perna_dir: 'Perna direita',
    perna_esq: 'Perna esquerda',
};

function statusFromStandardPct(pct: number, key: SegKey): Band {
    const lo = key === 'tronco' ? 90 : 80;
    const hi = key === 'tronco' ? 110 : 160;
    if (pct < lo) return 'baixo';
    if (pct > hi) return 'alto';
    return 'saudavel';
}

function fromWlaSegments(rows: WlaSegment[] | undefined, kind: 'muscle' | 'fat'): SegEstimate[] {
    if (!rows?.length) return [];
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return SEG_ORDER.flatMap((key) => {
        const row = byKey.get(key);
        if (!row) return [];
        const kg = kind === 'muscle' ? row.muscle_kg : row.fat_kg;
        const vsStandardPct = kind === 'muscle' ? row.muscle_vs_std_pct : row.fat_vs_std_pct;
        return [{
            key,
            label: SEG_LABEL[key],
            kg,
            vsStandardPct,
            status: statusFromStandardPct(vsStandardPct, key),
        }];
    });
}

function statusTone(status: Band) {
    if (status === 'alto') return 'is-high';
    if (status === 'baixo') return 'is-low';
    return 'is-ok';
}

function idealWeightRange(heightCm: number, sex?: string) {
    if (!(heightCm > 0)) return null;
    const m2 = (heightCm / 100) ** 2;
    const ref = isFemale(sex) ? 21 : 22;
    return {
        min: 18.5 * m2,
        ref: ref * m2,
        max: 24.9 * m2,
        refBmi: ref,
    };
}

function SegBodyFigure({
    items,
    tone,
}: {
    items: SegEstimate[];
    tone: 'muscle' | 'fat';
}) {
    const byKey = Object.fromEntries(items.map((item) => [item.key, item])) as Partial<Record<SegKey, SegEstimate>>;
    const partClass = (key: SegKey) => {
        const status = byKey[key]?.status;
        return `cabine-seg-part ${tone} ${status ? statusTone(status) : ''}`;
    };
    const callout = (key: SegKey, side: 'left' | 'right' | 'center') => {
        const item = byKey[key];
        if (!item) return null;
        return (
            <div className={`cabine-seg-callout ${side}`}>
                <em>{item.label}</em>
                <strong>{fmt(item.kg)} kg</strong>
                <small>{fmt(item.vsStandardPct, 0)}% do padrão</small>
                <span className={statusTone(item.status)}>{statusLabel(item.status) || '—'}</span>
            </div>
        );
    };

    return (
        <div className={`cabine-seg-figure cabine-seg-figure--${tone}`}>
            <div className="cabine-seg-callouts-left">
                {callout('braco_dir', 'left')}
                {callout('perna_dir', 'left')}
            </div>
            <svg viewBox="0 0 200 320" className="cabine-seg-svg" aria-hidden>
                <ellipse cx="100" cy="34" rx="28" ry="30" className="cabine-seg-head" />
                <rect x="64" y="68" width="72" height="100" rx="22" className={partClass('tronco')} />
                <rect x="18" y="78" width="42" height="100" rx="16" className={partClass('braco_dir')} />
                <rect x="140" y="78" width="42" height="100" rx="16" className={partClass('braco_esq')} />
                <rect x="68" y="172" width="28" height="128" rx="14" className={partClass('perna_dir')} />
                <rect x="104" y="172" width="28" height="128" rx="14" className={partClass('perna_esq')} />
            </svg>
            <div className="cabine-seg-callouts-right">
                {callout('braco_esq', 'right')}
                {callout('tronco', 'center')}
                {callout('perna_esq', 'right')}
            </div>
        </div>
    );
}

function SegmentalPanel({
    rows,
}: {
    rows?: WlaSegment[];
}) {
    const muscleItems = fromWlaSegments(rows, 'muscle');
    const fatItems = fromWlaSegments(rows, 'fat');
    if (!muscleItems.length && !fatItems.length) return null;

    return (
        <section className="cabine-report-block cabine-seg-panel">
            {muscleItems.length ? (
                <div className="cabine-seg-card">
                    <h3>Equilíbrio muscular</h3>
                    <p className="cabine-metric-hint">
                        Distribuição por região do corpo
                    </p>
                    <SegBodyFigure items={muscleItems} tone="muscle" />
                </div>
            ) : null}
            {fatItems.length ? (
                <div className="cabine-seg-card">
                    <h3>Gordura segmentar</h3>
                    <p className="cabine-metric-hint">
                        Distribuição por região do corpo
                    </p>
                    <SegBodyFigure items={fatItems} tone="fat" />
                </div>
            ) : null}
        </section>
    );
}

const TYPE_LABELS: Record<string, string> = {
    atletas: 'Atletas',
    ligeiramente_obeso: 'Ligeiramente obeso',
    obesidade: 'Obesidade',
    musculo: 'Músculo',
    saudavel: 'Saudável',
    sobrepeso: 'Sobrepeso',
    muscular_magro: 'Muscular magro',
    magro: 'Magro',
    baixo_peso_severo: 'Baixo peso severo',
    abaixo_do_peso: 'Abaixo do peso',
    obesidade_invisivel: 'Obesidade invisível',
};

function deriveBodyType(imc?: number, fat?: number, sex?: string, peopleType?: string) {
    if (imc == null || fat == null) return null;
    const { lo, hi } = fatCuts(sex);
    const lowFat = fat < lo;
    const highFat = fat > hi;

    if (imc >= 25) {
        if (lowFat) return 'atletas';
        if (!highFat) return 'ligeiramente_obeso';
        return 'obesidade';
    }
    if (imc >= 18.5) {
        if (highFat) return imc < 22 ? 'obesidade_invisivel' : 'sobrepeso';
        if (lowFat) return imc < 20.5 ? 'muscular_magro' : 'musculo';
        return imc < 20.5 ? 'magro' : 'saudavel';
    }
    if (highFat) return 'obesidade_invisivel';
    if (lowFat) return 'baixo_peso_severo';
    if ((peopleType || '').toLowerCase() === 'athlete') return 'atletas';
    return 'abaixo_do_peso';
}

function TypeGrid({
    highlight,
    imc,
    fatPct,
    sex,
}: {
    highlight: string | null;
    imc?: number;
    fatPct?: number;
    sex?: string;
}) {
    const { lo, hi } = fatCuts(sex);
    const cells: { id: string; label: string; area: string }[] = [
        { id: 'atletas', label: 'Atletas', area: 'atletas' },
        { id: 'ligeiramente_obeso', label: 'Ligeiramente obeso', area: 'ligeiro' },
        { id: 'obesidade', label: 'Obesidade', area: 'obesidade' },
        { id: 'musculo', label: 'Músculo', area: 'musculo' },
        { id: 'saudavel', label: 'Saudável', area: 'saudavel' },
        { id: 'sobrepeso', label: 'Sobrepeso', area: 'sobrepeso' },
        { id: 'muscular_magro', label: 'Muscular magro', area: 'muscmagro' },
        { id: 'magro', label: 'Magro', area: 'magro' },
        { id: 'baixo_peso_severo', label: 'Baixo peso severo', area: 'baixo' },
        { id: 'abaixo_do_peso', label: 'Abaixo do peso', area: 'abaixo_peso' },
        { id: 'obesidade_invisivel', label: 'Obesidade invisível', area: 'invisivel' },
    ];

    return (
        <div className="cabine-type-matrix" aria-label="Tipo corporal por IMC e gordura">
            <div className="cabine-type-yaxis" aria-hidden>
                <span className="cabine-type-axis-title">IMC (kg/m²)</span>
                <span className="cabine-type-tick cabine-type-tick--25">25,0</span>
                <span className="cabine-type-tick cabine-type-tick--185">18,5</span>
            </div>
            <div className="cabine-type-grid-wrap">
                <div className="cabine-type-matrix-grid">
                    {cells.map((cell) => (
                        <div
                            key={cell.id}
                            className={`cabine-type-cell${highlight === cell.id ? ' on' : ''}`}
                            style={{ gridArea: cell.area }}
                        >
                            {cell.label}
                        </div>
                    ))}
                </div>
                <div className="cabine-type-xaxis" aria-hidden>
                    <span className="cabine-type-tick cabine-type-tick--fatlo">{fmt(lo, 1)}</span>
                    <span className="cabine-type-tick cabine-type-tick--fathi">{fmt(hi, 1)}</span>
                    <span className="cabine-type-axis-title">Taxa de gordura corporal (%)</span>
                </div>
            </div>
            {(imc != null || fatPct != null) ? (
                <p className="cabine-metric-hint cabine-type-summary">
                    Nesta medição:
                    {imc != null ? ` IMC ${fmt(imc)}` : ''}
                    {fatPct != null ? ` · gordura ${fmt(fatPct)}%` : ''}
                    {highlight ? ` · ${TYPE_LABELS[highlight] ?? highlight}` : ''}.
                </p>
            ) : null}
        </div>
    );
}

function deriveHighlights(metrics: ScaleMetrics): MetricHighlight[] {
    if (metrics.destaques?.length) return metrics.destaques;
    const items: MetricHighlight[] = [];
    if (metrics.gordura_pct_status === 'alto') {
        items.push({
            codigo: 'gordura_alta',
            gravidade: 'alta',
            titulo: 'Gordura corporal acima',
            texto: 'O percentual de gordura ficou fora da faixa para o perfil.',
        });
    }
    if (metrics.gordura_visceral != null && metrics.gordura_visceral >= 10) {
        items.push({
            codigo: 'visceral_alta',
            gravidade: 'alta',
            titulo: 'Gordura visceral elevada',
            texto: 'O nível de gordura na região do tronco está alto.',
        });
    }
    if (metrics.agua_status === 'baixo') {
        items.push({
            codigo: 'agua_baixa',
            gravidade: 'media',
            titulo: 'Água corporal abaixo',
            texto: 'A fração de água ficou abaixo da faixa usual.',
        });
    }
    const arms = metrics.equilibrio?.bracos_diff_pct;
    const legs = metrics.equilibrio?.pernas_diff_pct;
    if ((arms != null && arms >= 10) || (legs != null && legs >= 10)) {
        items.push({
            codigo: 'assimetria',
            gravidade: 'media',
            titulo: 'Assimetria entre os lados',
            texto: 'A impedância esquerda/direita divergiu mais de 10%.',
        });
    }
    if (metrics.imc_status === 'alto' && metrics.gordura_pct_status !== 'alto') {
        items.push({
            codigo: 'imc_alto',
            gravidade: 'media',
            titulo: 'IMC acima',
            texto: 'O peso está acima da faixa de referência para a altura.',
        });
    }
    if (!items.length && metrics.imc_status === 'saudavel' && metrics.gordura_pct_status === 'saudavel') {
        items.push({
            codigo: 'ok',
            gravidade: 'baixa',
            titulo: 'Composição na faixa',
            texto: 'Os indicadores principais ficaram dentro das referências usadas neste relatório.',
        });
    }
    return items.slice(0, 3);
}

function RangeRow({
    label,
    value,
    rangeHint,
    status,
    marker,
}: {
    label: string;
    value: string;
    rangeHint?: string;
    status?: string;
    marker: number;
}) {
    return (
        <div className="cabine-range">
            <div className="cabine-range-head">
                <span>
                    {label}
                    {rangeHint ? <small>{rangeHint}</small> : null}
                </span>
                <span>
                    {value}
                    {status ? ` · ${statusLabel(status)}` : ''}
                </span>
            </div>
            <div className="cabine-range-track">
                <span />
                <span />
                <span />
                <i style={{ left: `${Math.max(4, Math.min(96, marker))}%` }} />
            </div>
            <div className="cabine-range-captions">
                <span>Baixo</span>
                <span>Adequado</span>
                <span>Alto</span>
            </div>
        </div>
    );
}

type Props = {
    personName: string;
    scaleName: string;
    heightCm: string;
    age: string;
    sex?: string;
    peopleType?: string;
    weightKg: number | null;
    metrics: ScaleMetrics | null;
    supportsBia: boolean;
    weightOnly?: boolean;
    saved?: boolean;
    segments?: BiaSegment[];
    measuredAt?: string;
};

export function BodyReport({
    personName,
    scaleName,
    heightCm,
    age,
    sex,
    peopleType,
    weightKg,
    metrics,
    supportsBia,
    weightOnly,
    saved,
    segments: _segments,
    measuredAt,
}: Props) {
    void _segments;    const bia = Boolean(supportsBia && !weightOnly && metrics);
    const wla = bia && (metrics?.metodo === 'wla25' || metrics?.agua_pct != null);
    const score = wla ? metrics?.score : undefined;
    const highlights = metrics ? deriveHighlights(metrics) : [];
    const fatBand = fatCuts(sex);
    const waterLo = isFemale(sex) ? 45 : 55;
    const waterHi = isFemale(sex) ? 60 : 65;
    const muscleLo = isFemale(sex) ? 38 : 44;
    const muscleHi = isFemale(sex) ? 47 : 54;
    const waterKgBand = kgCuts(metrics, 'agua');
    const skeletalKgBand = kgCuts(metrics, 'esqueletico');
    const leanKgBand = kgCuts(metrics, 'magra');
    const proteinKg = metrics?.proteina_kg
        ?? (metrics?.proteina_pct != null && weightKg != null ? weightKg * metrics.proteina_pct / 100 : null);
    const smi = metrics?.smi;
    const tipo = deriveBodyType(metrics?.imc, metrics?.gordura_pct, sex, peopleType)
        ?? (metrics?.tipo_corporal
            ? ({
                adequado: 'saudavel',
                atleta: 'atletas',
                baixo: 'baixo_peso_severo',
                'skinny-fat': 'obesidade_invisivel',
                'sobrepeso-musculo': 'ligeiramente_obeso',
            } as Record<string, string>)[metrics.tipo_corporal] ?? metrics.tipo_corporal
            : null);
    const musclePctOfWeight = metrics?.musculo_esqueletico_pct
        ?? (metrics?.musculo_esqueletico_kg != null && weightKg
            ? (metrics.musculo_esqueletico_kg / weightKg) * 100
            : null);
    const skeletalKg = metrics?.musculo_esqueletico_kg
        ?? (musclePctOfWeight != null && weightKg != null
            ? (musclePctOfWeight / 100) * weightKg
            : null);
    const muscleStatus = metrics?.musculo_esqueletico_status;
    const muscleStatusBand: Band | undefined =
        muscleStatus === 'baixo' || muscleStatus === 'saudavel' || muscleStatus === 'alto'
            ? muscleStatus
            : (skeletalKg != null && skeletalKgBand
                ? bandOf(skeletalKg, skeletalKgBand.lo, skeletalKgBand.hi)
                : (musclePctOfWeight != null ? bandOf(musclePctOfWeight, muscleLo, muscleHi) : undefined));
    const leanKg = metrics?.massa_magra_kg
        ?? (weightKg != null && metrics?.gordura_kg != null ? weightKg - metrics.gordura_kg : null);
    const leanPct = leanKg != null && weightKg ? (leanKg / weightKg) * 100 : null;
    const fatToLose = metrics?.controle_gordura_kg != null && metrics.controle_gordura_kg < -0.5
        ? Math.abs(metrics.controle_gordura_kg)
        : null;
    const muscleToGain = metrics?.controle_musculo_kg != null && metrics.controle_musculo_kg > 0.5
        ? metrics.controle_musculo_kg
        : null;
    const height = Number(heightCm);
    const weightRange = idealWeightRange(height, sex);

    const showMap = wla && Boolean(metrics?.segmentos_wla?.length);
    const composeTotal = weightKg ?? 0;
    const fatKg = metrics?.gordura_kg;
    const waterKg = metrics?.agua_kg;
    const boneKg = metrics?.osso_kg;
    const showCompose = wla && fatKg != null && waterKg != null && proteinKg != null && boneKg != null && composeTotal > 0;

    const indexChips: { label: string; value: string }[] = [];
    if (metrics?.musculo_kg != null) {
        indexChips.push({
            label: 'Massa muscular',
            value: `${fmt(metrics.musculo_kg)} kg${metrics.musculo_pct != null ? ` · ${fmt(metrics.musculo_pct)}%` : ''}${metrics.musculo_status ? ` · ${statusLabel(metrics.musculo_status)}` : ''}`,
        });
    }
    if (proteinKg != null) {
        indexChips.push({
            label: 'Proteína',
            value: `${fmt(proteinKg)} kg${metrics?.proteina_pct != null ? ` · ${fmt(metrics.proteina_pct)}%` : ''}${metrics?.proteina_status ? ` · ${statusLabel(metrics.proteina_status)}` : ''}`,
        });
    }
    if (metrics?.gordura_subcutanea_pct != null) {
        indexChips.push({
            label: 'Gordura subcutânea',
            value: `${fmt(metrics.gordura_subcutanea_pct)}%`,
        });
    }
    if (metrics?.idade_corporal != null) {
        indexChips.push({
            label: 'Idade do corpo',
            value: `${metrics.idade_corporal} anos`,
        });
    }
    if (metrics?.gordura_visceral != null) {
        indexChips.push({
            label: 'Gordura visceral',
            value: `nível ${metrics.gordura_visceral}${metrics.gordura_visceral_status ? ` · ${statusLabel(metrics.gordura_visceral_status)}` : ''}`,
        });
    }
    if (smi != null) {
        indexChips.push({
            label: 'Músculo / altura',
            value: `${fmt(smi)} kg/m²`,
        });
    }

    return (
        <div id="scale-report" className="cabine-report">
            <div className="cabine-report-head">
                <div>
                    <p className="cabine-kicker">Relatório de composição corporal</p>
                    <h2>{personName || 'Convidado'}</h2>
                    <p className="cabine-report-meta">
                        {heightCm} cm · {age} anos
                        {sex ? ` · ${isFemale(sex) ? 'Feminino' : 'Masculino'}` : ''}
                        {measuredAt ? ` · ${measuredAt}` : ''}
                        {scaleName ? ` · ${scaleName}` : ''}
                    </p>
                </div>
                {score != null ? (
                    <div className={`cabine-score${score < 50 ? ' is-low' : score < 70 ? ' is-mid' : ''}`} aria-label={`Pontuação de composição ${score} de 100`}>
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

            {highlights.length ? (
                <div className="cabine-highlights">
                    {highlights.map((item) => (
                        <article key={item.codigo} className={item.gravidade === 'baixa' ? 'is-ok' : undefined}>
                            <strong>{item.titulo}</strong>
                            {item.texto ? <p>{item.texto}</p> : null}
                        </article>
                    ))}
                </div>
            ) : null}

            {wla ? (
                <>
                    <div className="cabine-report-main">
                        <section className="cabine-report-block">
                            <h3>Índices corporais</h3>
                            <div className="cabine-ranges cabine-ranges--compact">
                                {metrics?.imc != null ? (
                                    <RangeRow
                                        label="IMC"
                                        rangeHint="18,5–24,9"
                                        value={fmt(metrics.imc) ?? ''}
                                        status={metrics.imc_status}
                                        marker={markerPct(metrics.imc, 18.5, 24.9)}
                                    />
                                ) : null}
                                {metrics?.gordura_pct != null ? (
                                    <RangeRow
                                        label="Gordura corporal"
                                        rangeHint={`${fatBand.lo}–${fatBand.hi}%`}
                                        value={[
                                            metrics.gordura_kg != null ? `${fmt(metrics.gordura_kg)} kg` : null,
                                            `${fmt(metrics.gordura_pct)}%`,
                                        ].filter(Boolean).join(' · ')}
                                        status={metrics.gordura_pct_status}
                                        marker={markerPct(metrics.gordura_pct, fatBand.lo, fatBand.hi)}
                                    />
                                ) : null}
                                {(skeletalKg != null || musclePctOfWeight != null) ? (
                                    <RangeRow
                                        label="Músculo esquelético"
                                        rangeHint={skeletalKgBand
                                            ? `${fmt(skeletalKgBand.lo)}–${fmt(skeletalKgBand.hi)} kg`
                                            : `${muscleLo}–${muscleHi}% do peso`}
                                        value={[
                                            skeletalKg != null ? `${fmt(skeletalKg)} kg` : null,
                                            musclePctOfWeight != null ? `${fmt(musclePctOfWeight)}%` : null,
                                        ].filter(Boolean).join(' · ')}
                                        status={muscleStatusBand}
                                        marker={skeletalKg != null && skeletalKgBand
                                            ? markerPct(skeletalKg, skeletalKgBand.lo, skeletalKgBand.hi)
                                            : (musclePctOfWeight != null ? markerPct(musclePctOfWeight, muscleLo, muscleHi) : 50)}
                                    />
                                ) : null}
                                {leanKg != null ? (
                                    <RangeRow
                                        label="Massa magra"
                                        rangeHint={leanKgBand ? `${fmt(leanKgBand.lo)}–${fmt(leanKgBand.hi)} kg` : undefined}
                                        value={[
                                            `${fmt(leanKg)} kg`,
                                            leanPct != null ? `${fmt(leanPct)}%` : null,
                                        ].filter(Boolean).join(' · ')}
                                        status={metrics?.massa_magra_status
                                            ?? (leanKgBand ? bandOf(leanKg, leanKgBand.lo, leanKgBand.hi) : undefined)
                                            ?? (leanPct != null ? bandOf(leanPct, 100 - fatBand.hi, 100 - fatBand.lo) : undefined)}
                                        marker={leanKgBand
                                            ? markerPct(leanKg, leanKgBand.lo, leanKgBand.hi)
                                            : (leanPct != null ? markerPct(leanPct, 100 - fatBand.hi, 100 - fatBand.lo) : 50)}
                                    />
                                ) : null}
                                {metrics?.agua_pct != null ? (
                                    <RangeRow
                                        label="Água corporal"
                                        rangeHint={waterKgBand
                                            ? `${fmt(waterKgBand.lo)}–${fmt(waterKgBand.hi)} kg`
                                            : `${waterLo}–${waterHi}%`}
                                        value={[
                                            metrics.agua_kg != null ? `${fmt(metrics.agua_kg)} kg` : null,
                                            `${fmt(metrics.agua_pct)}%`,
                                        ].filter(Boolean).join(' · ')}
                                        status={metrics.agua_status}
                                        marker={metrics.agua_kg != null && waterKgBand
                                            ? markerPct(metrics.agua_kg, waterKgBand.lo, waterKgBand.hi)
                                            : markerPct(metrics.agua_pct, waterLo, waterHi)}
                                    />
                                ) : null}
                            </div>
                            {indexChips.length ? (
                                <div className="cabine-index-chips">
                                    {indexChips.map((chip) => (
                                        <div key={chip.label}>
                                            <span>{chip.label}</span>
                                            <strong>{chip.value}</strong>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </section>

                        <div className="cabine-report-side">
                            {tipo ? (
                                <section className="cabine-report-block">
                                    <h3>Avaliação do tipo de corpo</h3>
                                    <TypeGrid
                                        highlight={tipo}
                                        imc={metrics?.imc}
                                        fatPct={metrics?.gordura_pct}
                                        sex={sex}
                                    />
                                </section>
                            ) : null}

                            <section className="cabine-report-block">
                                <h3>Controle de peso</h3>
                                <table className="cabine-mini-table">
                                    <tbody>
                                        {weightKg != null ? (
                                            <tr><th>Peso atual</th><td>{weightKg.toFixed(1)} kg</td></tr>
                                        ) : null}
                                        {weightRange ? (
                                            <tr>
                                                <th>Faixa adequada (IMC 18,5–24,9)</th>
                                                <td>{fmt(weightRange.min)}–{fmt(weightRange.max)} kg</td>
                                            </tr>
                                        ) : null}
                                        {weightRange ? (
                                            <tr>
                                                <th>Peso de referência (IMC {String(weightRange.refBmi).replace('.', ',')})</th>
                                                <td>{fmt(metrics?.peso_ideal_kg ?? weightRange.ref)} kg</td>
                                            </tr>
                                        ) : metrics?.peso_ideal_kg != null ? (
                                            <tr><th>Peso de referência</th><td>{fmt(metrics.peso_ideal_kg)} kg</td></tr>
                                        ) : null}
                                        {metrics?.controle_peso_kg != null ? (
                                            <tr>
                                                <th>Ajuste sugerido</th>
                                                <td>{metrics.controle_peso_kg > 0 ? '+' : ''}{fmt(metrics.controle_peso_kg)} kg</td>
                                            </tr>
                                        ) : null}
                                        {fatToLose != null ? (
                                            <tr><th>Gordura a reduzir</th><td>{fmt(fatToLose)} kg</td></tr>
                                        ) : null}
                                        {muscleToGain != null ? (
                                            <tr><th>Músculo a ganhar</th><td>{fmt(muscleToGain)} kg</td></tr>
                                        ) : null}
                                        {metrics?.tmb_kcal != null ? (
                                            <tr><th>Metabolismo de repouso</th><td>{Math.round(metrics.tmb_kcal)} kcal</td></tr>
                                        ) : null}
                                    </tbody>
                                </table>
                            </section>
                        </div>
                    </div>

                    {showMap ? (
                        <SegmentalPanel rows={metrics?.segmentos_wla} />
                    ) : null}

                    {showCompose ? (
                        <section className="cabine-report-block cabine-compose">
                            <h3>Composição do peso</h3>
                            <div className="cabine-compose-bar" aria-label="Composição">
                                <span style={{ width: `${(fatKg / (fatKg + waterKg + proteinKg + boneKg)) * 100}%` }} className="is-fat" />
                                <span style={{ width: `${(waterKg / (fatKg + waterKg + proteinKg + boneKg)) * 100}%` }} className="is-water" />
                                <span style={{ width: `${(proteinKg / (fatKg + waterKg + proteinKg + boneKg)) * 100}%` }} className="is-protein" />
                                <span style={{ width: `${(boneKg / (fatKg + waterKg + proteinKg + boneKg)) * 100}%` }} className="is-bone" />
                            </div>
                            <div className="cabine-compose-legend">
                                <span>Gordura {fmt(fatKg)} kg</span>
                                <span>Água {fmt(waterKg)} kg</span>
                                <span>Proteína {fmt(proteinKg)} kg</span>
                                <span>Osso {fmt(boneKg)} kg</span>
                            </div>
                        </section>
                    ) : null}
                </>
            ) : (
                <div className="cabine-metric-grid">
                    {weightKg != null ? (
                        <article className="cabine-metric-card">
                            <div className="cabine-metric-label"><span>Peso</span></div>
                            <div className="cabine-metric-value">{weightKg.toFixed(1)} kg</div>
                        </article>
                    ) : null}
                    {metrics?.imc != null ? (
                        <article className="cabine-metric-card">
                            <div className="cabine-metric-label">
                                <span>IMC</span>
                                <span>{statusLabel(metrics.imc_status)}</span>
                            </div>
                            <div className="cabine-metric-value">{fmt(metrics.imc)}</div>
                        </article>
                    ) : null}
                    {metrics?.tmb_kcal != null ? (
                        <article className="cabine-metric-card">
                            <div className="cabine-metric-label"><span>Metabolismo</span></div>
                            <div className="cabine-metric-value">{Math.round(metrics.tmb_kcal)} kcal</div>
                        </article>
                    ) : null}
                    {weightRange ? (
                        <article className="cabine-metric-card">
                            <div className="cabine-metric-label"><span>Faixa adequada</span></div>
                            <div className="cabine-metric-value cabine-metric-value--sm">
                                {fmt(weightRange.min)}–{fmt(weightRange.max)} kg
                            </div>
                        </article>
                    ) : metrics?.peso_ideal_kg != null ? (
                        <article className="cabine-metric-card">
                            <div className="cabine-metric-label"><span>Peso de referência</span></div>
                            <div className="cabine-metric-value">{fmt(metrics.peso_ideal_kg)} kg</div>
                        </article>
                    ) : null}
                </div>
            )}

            {metrics?.aviso ? (
                <p className="cabine-metric-hint" style={{ marginTop: 12 }}>
                    {/wla25|ffm|impedance|ohm|Ω|inválid|invalid/i.test(metrics.aviso)
                        ? (/inválid|invalid/i.test(metrics.aviso)
                            ? 'Não foi possível calcular a composição completa. Tente de novo com contato firme.'
                            : 'Composição corporal calculada a partir desta medição.')
                        : metrics.aviso}
                </p>
            ) : null}
        </div>
    );
}
