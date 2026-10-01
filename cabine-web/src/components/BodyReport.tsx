import { AlertTriangle } from 'lucide-react';
import type { BiaSegment, MetricHighlight, ScaleMetrics, SegKey, WlaSegment } from '../types/measurement';

type Band = 'baixo' | 'saudavel' | 'alto';
type Tone = 'ok' | 'limite' | 'baixo' | 'alto';

function isFemale(sex?: string) {
    const value = (sex || '').trim().toLowerCase();
    return value === 'f' || value === 'female' || value === 'feminino' || value === 'mulher';
}

function fmt(value?: number | null, digits = 1) {
    if (value == null || Number.isNaN(value)) return null;
    return value.toFixed(digits);
}

function statusLabel(status?: string) {
    if (status === 'saudavel' || status === 'ok') return 'Adequado';
    if (status === 'alto') return 'Acima';
    if (status === 'baixo') return 'Abaixo';
    if (status === 'limite') return 'No limite';
    return '';
}

function toneLabel(tone: Tone) {
    if (tone === 'alto') return 'Acima';
    if (tone === 'baixo') return 'Abaixo';
    if (tone === 'limite') return 'No limite';
    return 'Adequado';
}

function scalePlacement(value: number, low: number, high: number) {
    const span = Math.max(high - low, 0.1);
    const min = low - span;
    const max = high + span;
    const pct = (n: number) => ((n - min) / (max - min)) * 100;
    return {
        bandLeft: pct(low),
        bandWidth: pct(high) - pct(low),
        marker: Math.max(2, Math.min(98, pct(value))),
    };
}

function toneOf(value: number, low: number, high: number, status?: string): Tone {
    if (value > high) return 'alto';
    if (value < low) return 'baixo';
    const edge = Math.max(0.05, (high - low) * 0.02);
    if (value >= high - edge || value <= low + edge) return 'limite';
    if (status === 'alto') return 'alto';
    if (status === 'baixo') return 'baixo';
    return 'ok';
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
    braco_dir: 'Braço dir.',
    braco_esq: 'Braço esq.',
    tronco: 'Tronco',
    perna_dir: 'Perna dir.',
    perna_esq: 'Perna esq.',
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

const SEG_POLYGONS: Record<SegKey, string> = {
    braco_dir: '0,67 60,67 58,137 52,167 44,187 40,227 0,227',
    braco_esq: '118,67 176,67 176,227 143,227 133,187 125,167 119,137',
    tronco: '60,64 118,64 119,137 125,167 133,187 130,210 46,210 44,187 52,167 58,137',
    perna_dir: '30,210 88,210 88,384 30,384',
    perna_esq: '88,210 150,210 150,384 88,384',
};

function segmentFill(status?: Band) {
    if (status === 'alto') return '#f87171';
    if (status === 'baixo') return '#fbbf24';
    if (status === 'saudavel') return '#34d399';
    return '#b8bec7';
}

function SegBodyFigure({
    items,
}: {
    items: SegEstimate[];
    tone: 'muscle' | 'fat';
}) {
    const byKey = Object.fromEntries(items.map((item) => [item.key, item])) as Partial<Record<SegKey, SegEstimate>>;
    const tag = (key: SegKey, side: 'left' | 'right') => {
        const item = byKey[key];
        if (!item) return null;
        return (
            <div className={`cabine-seg-callout ${side}`}>
                <em>{item.label}</em>
                <strong>{fmt(item.kg)} kg</strong>
                <small>{fmt(item.vsStandardPct, 0)}% padrão</small>
                <span className={statusTone(item.status)}>{statusLabel(item.status) || '—'}</span>
            </div>
        );
    };

    return (
        <div className="cabine-fig-row">
            <div className="cabine-fig-col cabine-fig-col--left">
                {tag('braco_dir', 'left')}
                {tag('perna_dir', 'left')}
            </div>
            <div className="cabine-fig-body">
                <svg viewBox="0 0 176 384" preserveAspectRatio="none" aria-hidden>
                    <rect width="176" height="384" fill="#b8bec7" />
                    {SEG_ORDER.map((key) => (
                        <polygon key={key} points={SEG_POLYGONS[key]} fill={segmentFill(byKey[key]?.status)} />
                    ))}
                </svg>
            </div>
            <div className="cabine-fig-col cabine-fig-col--right">
                {tag('braco_esq', 'right')}
                {tag('tronco', 'right')}
                {tag('perna_esq', 'right')}
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
        <div className="cabine-seg-panel">
            {muscleItems.length ? (
                <div>
                    <p className="cabine-block-title">Equilíbrio muscular</p>
                    <SegBodyFigure items={muscleItems} tone="muscle" />
                </div>
            ) : null}
            {fatItems.length ? (
                <div>
                    <p className="cabine-block-title">Gordura segmentar</p>
                    <SegBodyFigure items={fatItems} tone="fat" />
                </div>
            ) : null}
        </div>
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
                <span className="cabine-type-axis-title">IMC</span>
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
                    <span className="cabine-type-axis-title">Gordura corporal (%)</span>
                </div>
            </div>
            {(imc != null || fatPct != null) ? (
                <div className="cabine-type-summary">
                    {highlight ? (
                        <p>
                            <strong>{TYPE_LABELS[highlight] ?? highlight}</strong>
                            {highlight === 'saudavel'
                                ? ' — IMC e percentual de gordura dentro da faixa adequada.'
                                : ' — classificação estimada por IMC e percentual de gordura.'}
                        </p>
                    ) : null}
                    <small>
                        Nesta medição:
                        {imc != null ? ` IMC ${fmt(imc)}` : ''}
                        {fatPct != null ? ` · gordura ${fmt(fatPct)}%` : ''}
                        {sex ? ` (faixa ${isFemale(sex) ? 'feminina' : 'masculina'} ${lo}–${hi}%)` : ''}
                    </small>
                </div>
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
    hint,
    value,
    rangeHint,
    tone,
    bandLeft,
    bandWidth,
    marker,
}: {
    label: string;
    hint?: string;
    value: string;
    rangeHint?: string;
    tone: Tone;
    bandLeft: number;
    bandWidth: number;
    marker: number;
}) {
    return (
        <div className={`cabine-ind-card${tone === 'alto' ? ' is-alto' : tone === 'baixo' ? ' is-baixo' : ''}`}>
            <div className="cabine-ind-name">
                <span>{label}</span>
                {hint ? <small>{hint}</small> : null}
            </div>
            <strong className="cabine-ind-value">{value}</strong>
            <div className="cabine-ind-bar">
                <span className="cabine-ind-track" />
                <span className="cabine-ind-band" style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }} />
                <i className={`cabine-ind-dot ${tone}`} style={{ left: `${marker}%` }} />
            </div>
            <span className="cabine-ind-ref">{rangeHint ?? '—'}</span>
            <span className={`cabine-ind-status ${tone}`}>{toneLabel(tone)}</span>
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
    embedded?: boolean;
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
    embedded,
    segments: _segments,
    measuredAt,
}: Props) {
    void _segments;
    const bia = Boolean(supportsBia && !weightOnly && metrics);
    const score = bia ? metrics?.score : undefined;
    const highlights = metrics ? deriveHighlights(metrics) : [];
    const fatBand = fatCuts(sex);
    const waterLo = isFemale(sex) ? 45 : 55;
    const waterHi = isFemale(sex) ? 60 : 65;
    const muscleLo = isFemale(sex) ? 38 : 44;
    const muscleHi = isFemale(sex) ? 47 : 54;
    const skeletalKgBand = kgCuts(metrics, 'esqueletico');
    const leanKgBand = kgCuts(metrics, 'magra');
    const proteinKgBand = kgCuts(metrics, 'proteina');
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

    const showMap = bia && Boolean(metrics?.segmentos_wla?.length);
    const composeTotal = weightKg ?? 0;
    const fatKg = metrics?.gordura_kg;
    const waterKg = metrics?.agua_kg;
    const boneKg = metrics?.osso_kg;
    const showCompose = bia && fatKg != null && waterKg != null && proteinKg != null && boneKg != null && composeTotal > 0;

    const indicators: Array<{
        key: string;
        label: string;
        hint?: string;
        value: string;
        rangeHint: string;
        tone: Tone;
        bandLeft: number;
        bandWidth: number;
        marker: number;
    }> = [];

    const addIndicator = (
        item: {
            key: string;
            label: string;
            hint?: string;
            value: string;
            rangeHint: string;
            measured: number;
            low: number;
            high: number;
            status?: string;
        },
    ) => {
        const place = scalePlacement(item.measured, item.low, item.high);
        indicators.push({
            key: item.key,
            label: item.label,
            hint: item.hint,
            value: item.value,
            rangeHint: item.rangeHint,
            tone: toneOf(item.measured, item.low, item.high, item.status),
            ...place,
        });
    };

    if (metrics?.imc != null) {
        addIndicator({
            key: 'imc',
            label: 'IMC',
            hint: 'Índice de massa corporal',
            value: fmt(metrics.imc) ?? '',
            rangeHint: '18,5 – 24,9',
            measured: metrics.imc,
            low: 18.5,
            high: 24.9,
            status: metrics.imc_status,
        });
    }
    if (metrics?.gordura_pct != null) {
        addIndicator({
            key: 'fat',
            label: 'Gordura corporal',
            hint: metrics.gordura_kg != null ? `${fmt(metrics.gordura_kg)} kg total` : undefined,
            value: `${fmt(metrics.gordura_pct)}%`,
            rangeHint: `${fatBand.lo} – ${fatBand.hi}%`,
            measured: metrics.gordura_pct,
            low: fatBand.lo,
            high: fatBand.hi,
            status: metrics.gordura_pct_status,
        });
    }
    if (metrics?.gordura_visceral != null) {
        addIndicator({
            key: 'visceral',
            label: 'Gordura visceral',
            hint: 'Gordura entre os órgãos',
            value: `Nível ${fmt(metrics.gordura_visceral, 0)}`,
            rangeHint: '1 – 9',
            measured: metrics.gordura_visceral,
            low: 1,
            high: 9,
            status: metrics.gordura_visceral_status,
        });
    }
    if (skeletalKg != null || musclePctOfWeight != null) {
        if (skeletalKg != null && skeletalKgBand) {
            addIndicator({
                key: 'skeletal',
                label: 'Músculo esquelético',
                hint: `${fmt(skeletalKg)} kg total`,
                value: musclePctOfWeight != null ? `${fmt(musclePctOfWeight)}%` : `${fmt(skeletalKg)} kg`,
                rangeHint: `${fmt(skeletalKgBand.lo)} – ${fmt(skeletalKgBand.hi)} kg`,
                measured: skeletalKg,
                low: skeletalKgBand.lo,
                high: skeletalKgBand.hi,
                status: muscleStatus,
            });
        } else if (musclePctOfWeight != null) {
            addIndicator({
                key: 'skeletal',
                label: 'Músculo esquelético',
                hint: skeletalKg != null ? `${fmt(skeletalKg)} kg total` : undefined,
                value: `${fmt(musclePctOfWeight)}%`,
                rangeHint: `${muscleLo} – ${muscleHi}%`,
                measured: musclePctOfWeight,
                low: muscleLo,
                high: muscleHi,
                status: muscleStatus,
            });
        }
    }
    if (leanKg != null) {
        const low = leanKgBand?.lo ?? (leanPct != null ? 100 - fatBand.hi : leanKg);
        const high = leanKgBand?.hi ?? (leanPct != null ? 100 - fatBand.lo : leanKg);
        addIndicator({
            key: 'lean',
            label: 'Massa magra',
            hint: `${fmt(leanKg)} kg total`,
            value: leanPct != null ? `${fmt(leanPct)}%` : `${fmt(leanKg)} kg`,
            rangeHint: leanKgBand
                ? `${fmt(leanKgBand.lo)} – ${fmt(leanKgBand.hi)} kg`
                : `${100 - fatBand.hi} – ${100 - fatBand.lo}%`,
            measured: leanKgBand ? leanKg : (leanPct ?? leanKg),
            low,
            high,
            status: metrics?.massa_magra_status,
        });
    }
    if (proteinKg != null && proteinKgBand) {
        addIndicator({
            key: 'protein',
            label: 'Proteína',
            value: `${fmt(proteinKg)} kg`,
            rangeHint: `${fmt(proteinKgBand.lo)} – ${fmt(proteinKgBand.hi)} kg`,
            measured: proteinKg,
            low: proteinKgBand.lo,
            high: proteinKgBand.hi,
            status: metrics?.proteina_status,
        });
    }
    if (smi != null) {
        const smiMin = isFemale(sex) ? 5.7 : 7;
        addIndicator({
            key: 'smi',
            label: 'Músculo / altura (SMI)',
            hint: `Risco de perda muscular abaixo de ${String(smiMin).replace('.', ',')}`,
            value: `${fmt(smi)} kg/m²`,
            rangeHint: `≥ ${String(smiMin).replace('.', ',')} kg/m²`,
            measured: smi,
            low: smiMin,
            high: smiMin * 2.5,
            status: smi < smiMin ? 'baixo' : 'saudavel',
        });
    }
    if (metrics?.agua_pct != null) {
        addIndicator({
            key: 'water',
            label: 'Água corporal',
            hint: metrics.agua_kg != null ? `${fmt(metrics.agua_kg)} kg total` : undefined,
            value: `${fmt(metrics.agua_pct)}%`,
            rangeHint: `${waterLo} – ${waterHi}%`,
            measured: metrics.agua_pct,
            low: waterLo,
            high: waterHi,
            status: metrics.agua_status,
        });
    }
    if (metrics?.idade_corporal != null && Number(age) > 0) {
        const realAge = Number(age);
        addIndicator({
            key: 'body-age',
            label: 'Idade do corpo',
            hint: `Idade real: ${realAge} anos`,
            value: `${metrics.idade_corporal} anos`,
            rangeHint: `≤ ${realAge} anos`,
            measured: metrics.idade_corporal,
            low: Math.max(1, realAge * 0.7),
            high: realAge,
            status: metrics.idade_corporal > realAge ? 'alto' : 'saudavel',
        });
    }

    const adequateCount = indicators.filter((item) => item.tone === 'ok').length;
    const attentionLabels = indicators
        .filter((item) => item.tone !== 'ok')
        .map((item) => item.label);
    const attentionLines = Array.from(
        { length: Math.ceil(attentionLabels.length / 3) },
        (_, i) => attentionLabels.slice(i * 3, i * 3 + 3).join(', '),
    );

    return (
        <div id="scale-report" className="cabine-report">
            {!embedded ? (
                <>
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
                </>
            ) : null}

            {weightOnly ? (
                <p className="cabine-note">
                    Nesta vez a balança registrou o peso. Para a composição completa, suba já segurando a barra
                    com as duas mãos e os pés descalços no centro da plataforma.
                </p>
            ) : null}

            {!embedded && highlights.length ? (
                <div className="cabine-highlights">
                    {highlights.map((item) => (
                        <article key={item.codigo} className={item.gravidade === 'baixa' ? 'is-ok' : undefined}>
                            <strong>{item.titulo}</strong>
                            {item.texto ? <p>{item.texto}</p> : null}
                        </article>
                    ))}
                </div>
            ) : null}

            {bia ? (
                <>
                    {showCompose ? (
                        <section className="cabine-report-block cabine-compose">
                            <p className="cabine-block-title cabine-compose-title">
                                Composição de peso — <b>{weightKg?.toFixed(1)} kg</b>
                            </p>
                            <div className="cabine-compose-bar" aria-label="Composição do peso">
                                <div style={{ flex: `${fatKg} 1 0` }} className="is-fat">
                                    <span>Gordura</span>
                                    <strong>{metrics?.gordura_pct != null ? `${fmt(metrics.gordura_pct, 0)}%` : `${fmt(fatKg)} kg`}</strong>
                                    <small>{fmt(fatKg)} kg</small>
                                </div>
                                <div style={{ flex: `${waterKg} 1 0` }} className="is-water">
                                    <span>Água</span>
                                    <strong>{metrics?.agua_pct != null ? `${fmt(metrics.agua_pct, 0)}%` : `${fmt(waterKg)} kg`}</strong>
                                    <small>{fmt(waterKg)} kg</small>
                                </div>
                                <div style={{ flex: `${proteinKg} 1 0` }} className="is-protein">
                                    <span>Proteína</span>
                                    <strong>{metrics?.proteina_pct != null ? `${fmt(metrics.proteina_pct, 0)}%` : `${fmt(proteinKg)} kg`}</strong>
                                    <small>{fmt(proteinKg)} kg</small>
                                </div>
                                <div style={{ flex: `${boneKg} 1 0` }} className="is-bone">
                                    <span>Osso</span>
                                    <strong>{weightKg ? `${fmt((boneKg / weightKg) * 100, 0)}%` : `${fmt(boneKg)} kg`}</strong>
                                    <small>{fmt(boneKg)} kg</small>
                                </div>
                            </div>
                        </section>
                    ) : null}

                    {showCompose ? <hr className="cabine-report-divider" /> : null}

                    {indicators.length ? (
                        <section className="cabine-report-block">
                            <div className="cabine-ind-heading">
                                <div>
                                    <p className="cabine-block-title">Índices corporais</p>
                                    <span className="cabine-ind-count">
                                        {adequateCount} de {indicators.length} parâmetros adequados
                                    </span>
                                </div>
                                {attentionLabels.length ? (
                                    <div className="cabine-ind-alert" role="status">
                                        <p>
                                            <AlertTriangle size={13} aria-hidden />
                                            <b>Pontos de atenção</b>
                                        </p>
                                        {attentionLines.map((line) => (
                                            <span key={line}>{line}</span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                            <div className="cabine-indicators">
                                <div className="cabine-ind-head" aria-hidden>
                                    <span>Indicador</span>
                                    <span>Resultado</span>
                                    <span>Posição na faixa</span>
                                    <span>Referência</span>
                                    <span>Situação</span>
                                </div>
                                {indicators.map((indicator) => (
                                    <RangeRow
                                        key={indicator.key}
                                        label={indicator.label}
                                        hint={indicator.hint}
                                        value={indicator.value}
                                        rangeHint={indicator.rangeHint}
                                        tone={indicator.tone}
                                        bandLeft={indicator.bandLeft}
                                        bandWidth={indicator.bandWidth}
                                        marker={indicator.marker}
                                    />
                                ))}
                            </div>
                        </section>
                    ) : null}

                    {showMap ? (
                        <>
                            <hr className="cabine-report-divider" />
                            <SegmentalPanel rows={metrics?.segmentos_wla} />
                        </>
                    ) : null}

                    {(tipo || weightKg != null || metrics?.peso_ideal_kg != null) ? (
                        <>
                            <hr className="cabine-report-divider" />
                            <div className="cabine-type-control">
                                {tipo ? (
                                    <section className="cabine-report-block cabine-type">
                                        <p className="cabine-block-title">Tipo corporal</p>
                                        <TypeGrid
                                            highlight={tipo}
                                            imc={metrics?.imc}
                                            fatPct={metrics?.gordura_pct}
                                            sex={sex}
                                        />
                                    </section>
                                ) : null}

                                <section className="cabine-report-block cabine-control">
                                    <p className="cabine-block-title">Controle de peso</p>
                                    <div className="cabine-control-rows">
                                        {weightKg != null ? (
                                            <div><span>Peso atual</span><b>{weightKg.toFixed(1)} kg</b></div>
                                        ) : null}
                                        {weightRange ? (
                                            <div><span>Faixa adequada</span><b>{fmt(weightRange.min)}–{fmt(weightRange.max)} kg</b></div>
                                        ) : null}
                                        {(weightRange || metrics?.peso_ideal_kg != null) ? (
                                            <div>
                                                <span>Peso de referência</span>
                                                <b>{fmt(metrics?.peso_ideal_kg ?? weightRange?.ref)} kg</b>
                                            </div>
                                        ) : null}
                                        {metrics?.controle_peso_kg != null ? (
                                            <div>
                                                <span>Ajuste sugerido</span>
                                                <b className="warning">{metrics.controle_peso_kg > 0 ? '+' : ''}{fmt(metrics.controle_peso_kg)} kg</b>
                                            </div>
                                        ) : null}
                                        {fatToLose != null ? (
                                            <div><span>Gordura a reduzir</span><b className="warning">{fmt(fatToLose)} kg</b></div>
                                        ) : null}
                                        {muscleToGain != null ? (
                                            <div><span>Músculo a ganhar</span><b className="info">+{fmt(muscleToGain)} kg</b></div>
                                        ) : null}
                                        {metrics?.tmb_kcal != null ? (
                                            <div><span>Metabolismo de repouso</span><b>{Math.round(metrics.tmb_kcal)} kcal</b></div>
                                        ) : null}
                                    </div>
                                </section>
                            </div>
                        </>
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
