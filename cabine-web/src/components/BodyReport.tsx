import type { Destaque, ScaleMetrics, Segmento } from '../types/measurement';

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

function ohmAt(segmentos: Segmento[] | undefined, lado: string, freq: number) {
    const hit = segmentos?.find((item) => item.lado === lado && item.freq_khz === freq);
    return hit?.ohm;
}

function deriveBodyType(imc?: number, fat?: number, sex?: string, peopleType?: string) {
    if (imc == null || fat == null) return null;
    const fatLo = isFemale(sex) ? 18 : 8;
    const fatHi = isFemale(sex) ? 28 : 20;
    const highFat = fat > fatHi;
    const lowFat = fat < fatLo;
    if (imc >= 30 && highFat) return 'obesidade';
    if (imc >= 25 && !highFat) return 'atleta';
    if (imc >= 25) return 'sobrepeso';
    if (imc < 18.5 && highFat) return 'skinny-fat';
    if (imc < 18.5) return 'baixo';
    if (highFat) return 'sobrepeso';
    if (lowFat) return 'magro';
    if ((peopleType || '').toLowerCase() === 'athlete') return 'atleta';
    return 'adequado';
}

function deriveHighlights(metrics: ScaleMetrics): Destaque[] {
    if (metrics.destaques?.length) return metrics.destaques;
    const items: Destaque[] = [];
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
    status,
    marker,
    lowCaption = 'Baixo',
    midCaption = 'Adequado',
    highCaption = 'Alto',
}: {
    label: string;
    value: string;
    status?: string;
    marker: number;
    lowCaption?: string;
    midCaption?: string;
    highCaption?: string;
}) {
    return (
        <div className="cabine-range">
            <div className="cabine-range-head">
                <span>{label}</span>
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
                <span>{lowCaption}</span>
                <span>{midCaption}</span>
                <span>{highCaption}</span>
            </div>
        </div>
    );
}

function BodyMap({
    segmentos,
    z20,
    balance,
}: {
    segmentos?: Segmento[];
    z20?: number[];
    balance?: ScaleMetrics['equilibrio'];
}) {
    const ra = ohmAt(segmentos, 'braco_dir', 20) ?? z20?.[0];
    const la = ohmAt(segmentos, 'braco_esq', 20) ?? z20?.[1];
    const rl = ohmAt(segmentos, 'perna_dir', 20) ?? z20?.[2];
    const ll = ohmAt(segmentos, 'perna_esq', 20) ?? z20?.[3];
    const tr = ohmAt(segmentos, 'tronco', 20) ?? z20?.[4];
    if (ra == null && la == null && rl == null && ll == null) return null;

    const armMax = Math.max(ra ?? 0, la ?? 0);
    const legMax = Math.max(rl ?? 0, ll ?? 0);
    const fill = (ohm: number | undefined, max: number) => (ohm != null && ohm === max && max > 0 ? 'hot' : '');

    return (
        <div className="cabine-bodymap">
            <svg viewBox="0 0 220 320" width="168" height="248" aria-label="Simetria elétrica">
                <rect x="88" y="12" width="44" height="44" rx="22" className="cabine-body-head" />
                <rect x="70" y="58" width="80" height="88" rx="18" className="cabine-body-part" />
                <rect x="18" y="62" width="46" height="92" rx="16" className={`cabine-body-part ${fill(ra, armMax)}`} />
                <rect x="156" y="62" width="46" height="92" rx="16" className={`cabine-body-part ${fill(la, armMax)}`} />
                <rect x="74" y="150" width="32" height="150" rx="14" className={`cabine-body-part ${fill(rl, legMax)}`} />
                <rect x="114" y="150" width="32" height="150" rx="14" className={`cabine-body-part ${fill(ll, legMax)}`} />
            </svg>
            <div className="cabine-bodymap-legend">
                {ra != null ? <p>Braço D {ra.toFixed(0)} Ω</p> : null}
                {la != null ? <p>Braço E {la.toFixed(0)} Ω{balance?.bracos_diff_pct != null ? ` · diff ${balance.bracos_diff_pct}%` : ''}</p> : null}
                {tr != null ? <p>Tronco {tr.toFixed(1)} Ω</p> : null}
                {rl != null ? <p>Perna D {rl.toFixed(0)} Ω</p> : null}
                {ll != null ? <p>Perna E {ll.toFixed(0)} Ω{balance?.pernas_diff_pct != null ? ` · diff ${balance.pernas_diff_pct}%` : ''}</p> : null}
                <p className="cabine-metric-hint">Lado mais escuro = maior resistência nesta leitura. Não é kg de gordura.</p>
            </div>
        </div>
    );
}

function TypeGrid({ highlight }: { highlight: string | null }) {
    const cells = [
        ['atleta', 'Atleta'],
        ['sobrepeso-musculo', 'Sobrepeso'],
        ['obesidade', 'Obesidade'],
        ['magro', 'Magro'],
        ['adequado', 'Adequado'],
        ['sobrepeso', 'Sobrepeso'],
        ['baixo', 'Baixo peso'],
        ['baixo-gordo', 'Baixo peso'],
        ['skinny-fat', 'Magro-gordo'],
    ];
    return (
        <div className="cabine-type-grid" aria-label="Tipo corporal">
            {cells.map(([key, label]) => (
                <div key={key} className={highlight === key ? 'on' : undefined}>{label}</div>
            ))}
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
    pesoKg: number | null;
    metrics: ScaleMetrics | null;
    supportsBia: boolean;
    weightOnly?: boolean;
    saved?: boolean;
    segmentos?: Segmento[];
    measuredAt?: string;
};

export function BodyReport({
    personName,
    scaleName,
    heightCm,
    age,
    sex,
    peopleType,
    pesoKg,
    metrics,
    supportsBia,
    weightOnly,
    saved,
    segmentos,
    measuredAt,
}: Props) {
    const bia = Boolean(supportsBia && !weightOnly && metrics);
    const wla = bia && (metrics?.metodo === 'wla25' || metrics?.agua_pct != null);
    const score = wla ? metrics?.score : undefined;
    const highlights = metrics ? deriveHighlights(metrics) : [];
    const height = Number(heightCm);
    const fatLo = isFemale(sex) ? 18 : 8;
    const fatHi = isFemale(sex) ? 28 : 20;
    const waterLo = isFemale(sex) ? 45 : 50;
    const waterHi = isFemale(sex) ? 60 : 65;
    const muscleLo = isFemale(sex) ? 24 : 33;
    const muscleHi = isFemale(sex) ? 30 : 39;
    const proteinKg = metrics?.proteina_kg
        ?? (metrics?.proteina_pct != null && pesoKg != null ? pesoKg * metrics.proteina_pct / 100 : null);
    const smi = metrics?.smi
        ?? (metrics?.musculo_esqueletico_kg != null && height > 0
            ? metrics.musculo_esqueletico_kg / ((height / 100) ** 2)
            : null);
    const tipo = metrics?.tipo_corporal
        ?? deriveBodyType(metrics?.imc, metrics?.gordura_pct, sex, peopleType);
    const viscStatus = metrics?.gordura_visceral_status
        ?? (metrics?.gordura_visceral != null ? (metrics.gordura_visceral >= 10 ? 'alto' : 'saudavel') : undefined);
    const musclePctOfWeight = metrics?.musculo_esqueletico_kg != null && pesoKg
        ? (metrics.musculo_esqueletico_kg / pesoKg) * 100
        : null;
    const fatControl = metrics?.gordura_kg != null && pesoKg != null
        ? metrics.gordura_kg - pesoKg * (isFemale(sex) ? 0.25 : 0.15)
        : null;

    const z20 = metrics?.z_20khz;
    const z100 = metrics?.z_100khz;
    const showMap = wla && (Boolean(segmentos?.length) || Boolean(z20?.length));
    const composeTotal = pesoKg ?? 0;
    const fatKg = metrics?.gordura_kg;
    const waterKg = metrics?.agua_kg;
    const boneKg = metrics?.osso_kg;
    const showCompose = wla && fatKg != null && waterKg != null && proteinKg != null && boneKg != null && composeTotal > 0;

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
                    <div className={`cabine-score${score < 50 ? ' is-low' : score < 70 ? ' is-mid' : ''}`} aria-label={`Pontuação ${score} de 100`}>
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
                <div className="cabine-report-split">
                    {showMap ? (
                        <div>
                            <h3>Onde está o desvio</h3>
                            <BodyMap segmentos={segmentos} z20={z20} balance={metrics?.equilibrio} />
                        </div>
                    ) : null}
                    <div className="cabine-ranges">
                        <h3>Faixas</h3>
                        {pesoKg != null ? (
                            <RangeRow
                                label="Peso"
                                value={`${pesoKg.toFixed(1)} kg`}
                                status={metrics?.imc_status}
                                marker={metrics?.imc != null ? markerPct(metrics.imc, 18.5, 24.9) : 50}
                            />
                        ) : null}
                        {metrics?.musculo_esqueletico_kg != null && musclePctOfWeight != null ? (
                            <RangeRow
                                label="Músculo esquelético"
                                value={`${fmt(metrics.musculo_esqueletico_kg)} kg`}
                                status={bandOf(musclePctOfWeight, muscleLo, muscleHi)}
                                marker={markerPct(musclePctOfWeight, muscleLo, muscleHi)}
                            />
                        ) : null}
                        {metrics?.gordura_kg != null && metrics.gordura_pct != null ? (
                            <RangeRow
                                label="Gordura"
                                value={`${fmt(metrics.gordura_kg)} kg · ${fmt(metrics.gordura_pct)}%`}
                                status={metrics.gordura_pct_status}
                                marker={markerPct(metrics.gordura_pct, fatLo, fatHi)}
                            />
                        ) : null}
                        {metrics?.imc != null ? (
                            <RangeRow
                                label="IMC"
                                value={fmt(metrics.imc) ?? ''}
                                status={metrics.imc_status}
                                marker={markerPct(metrics.imc, 18.5, 24.9)}
                            />
                        ) : null}
                        {metrics?.gordura_pct != null ? (
                            <RangeRow
                                label="Gordura corporal"
                                value={`${fmt(metrics.gordura_pct)}%`}
                                status={metrics.gordura_pct_status}
                                marker={markerPct(metrics.gordura_pct, fatLo, fatHi)}
                            />
                        ) : null}
                        {metrics?.agua_pct != null ? (
                            <RangeRow
                                label="Água"
                                value={`${fmt(metrics.agua_pct)}%`}
                                status={metrics.agua_status}
                                marker={markerPct(metrics.agua_pct, waterLo, waterHi)}
                            />
                        ) : null}
                        {metrics?.gordura_visceral != null ? (
                            <RangeRow
                                label="Gordura visceral"
                                value={`nível ${metrics.gordura_visceral}`}
                                status={viscStatus}
                                marker={markerPct(metrics.gordura_visceral, 1, 9)}
                                lowCaption="Adequado"
                                midCaption="Atenção"
                                highCaption="Alto"
                            />
                        ) : null}
                    </div>
                </div>
            ) : (
                <div className="cabine-metric-grid">
                    {pesoKg != null ? (
                        <article className="cabine-metric-card">
                            <div className="cabine-metric-label"><span>Peso</span></div>
                            <div className="cabine-metric-value">{pesoKg.toFixed(1)} kg</div>
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
                    {metrics?.peso_ideal_kg != null ? (
                        <article className="cabine-metric-card">
                            <div className="cabine-metric-label"><span>Peso de referência</span></div>
                            <div className="cabine-metric-value">{fmt(metrics.peso_ideal_kg)} kg</div>
                        </article>
                    ) : null}
                </div>
            )}

            {showCompose ? (
                <div className="cabine-compose">
                    <h3>Composição do peso</h3>
                    <p className="cabine-metric-hint">
                        Gordura + água + proteína + osso. Músculo esquelético não entra de novo nesta barra.
                    </p>
                    <div className="cabine-compose-bar" aria-label="Composição">
                        <span style={{ width: `${(fatKg / composeTotal) * 100}%` }} className="is-fat" />
                        <span style={{ width: `${(waterKg / composeTotal) * 100}%` }} className="is-water" />
                        <span style={{ width: `${(proteinKg / composeTotal) * 100}%` }} className="is-protein" />
                        <span style={{ width: `${(boneKg / composeTotal) * 100}%` }} className="is-bone" />
                    </div>
                    <div className="cabine-compose-legend">
                        <span>Gordura {fmt(fatKg)} kg</span>
                        <span>Água {fmt(waterKg)} kg</span>
                        <span>Proteína {fmt(proteinKg)} kg</span>
                        <span>Osso {fmt(boneKg)} kg</span>
                    </div>
                </div>
            ) : null}

            {wla ? (
                <div className="cabine-report-split">
                    {tipo ? (
                        <div>
                            <h3>Tipo corporal</h3>
                            <p className="cabine-metric-hint">Grade IMC × gordura % nesta medição.</p>
                            <TypeGrid highlight={tipo} />
                        </div>
                    ) : null}
                    <div>
                        <h3>Controle de peso</h3>
                        <table className="cabine-mini-table">
                            <tbody>
                                {pesoKg != null ? (
                                    <tr><th>Peso atual</th><td>{pesoKg.toFixed(1)} kg</td></tr>
                                ) : null}
                                {metrics?.peso_ideal_kg != null ? (
                                    <tr><th>Peso de referência (IMC 22)</th><td>{fmt(metrics.peso_ideal_kg)} kg</td></tr>
                                ) : null}
                                {metrics?.controle_peso_kg != null ? (
                                    <tr>
                                        <th>Ajuste de peso</th>
                                        <td>{metrics.controle_peso_kg > 0 ? '+' : ''}{fmt(metrics.controle_peso_kg)} kg</td>
                                    </tr>
                                ) : null}
                                {fatControl != null && fatControl > 0.5 ? (
                                    <tr><th>Gordura a reduzir (estimativa)</th><td>~{fmt(fatControl)} kg</td></tr>
                                ) : null}
                                {metrics?.tmb_kcal != null ? (
                                    <tr><th>Metabolismo de repouso</th><td>{Math.round(metrics.tmb_kcal)} kcal</td></tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : null}

            {wla ? (
                <div className="cabine-stat-row">
                    {metrics?.gordura_visceral != null ? (
                        <div><strong>{metrics.gordura_visceral}</strong><span>Gordura visceral</span></div>
                    ) : null}
                    {metrics?.idade_corporal != null ? (
                        <div><strong>{metrics.idade_corporal} anos</strong><span>Idade corporal</span></div>
                    ) : null}
                    {smi != null ? (
                        <div><strong>{fmt(smi)}</strong><span>SMI (músculo / m²)</span></div>
                    ) : null}
                    {metrics?.gordura_subcutanea_pct != null ? (
                        <div><strong>{fmt(metrics.gordura_subcutanea_pct)}%</strong><span>Gordura subcutânea</span></div>
                    ) : null}
                </div>
            ) : null}

            {wla && (segmentos?.length || z20?.length) ? (
                <div>
                    <h3>Impedância</h3>
                    <p className="cabine-metric-hint">Valores em ohms. Tronco baixo e membros altos é o padrão esperado.</p>
                    <table className="cabine-mini-table">
                        <thead>
                            <tr>
                                <th>Segmento</th>
                                <th>20 kHz</th>
                                <th>100 kHz</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                ['Braço direito', 'braco_dir', 0],
                                ['Braço esquerdo', 'braco_esq', 1],
                                ['Tronco', 'tronco', 4],
                                ['Perna direita', 'perna_dir', 2],
                                ['Perna esquerda', 'perna_esq', 3],
                            ].map(([label, lado, idx]) => {
                                const a = ohmAt(segmentos, String(lado), 20) ?? z20?.[Number(idx)];
                                const b = ohmAt(segmentos, String(lado), 100) ?? z100?.[Number(idx)];
                                if (a == null && b == null) return null;
                                return (
                                    <tr key={String(lado)}>
                                        <th>{label}</th>
                                        <td>{a != null ? a.toFixed(1) : '—'}</td>
                                        <td>{b != null ? b.toFixed(1) : '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : null}

            {metrics?.aviso && wla ? (
                <p className="cabine-metric-hint" style={{ marginTop: 16 }}>{metrics.aviso}</p>
            ) : null}
        </div>
    );
}
