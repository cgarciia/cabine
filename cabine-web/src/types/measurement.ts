export interface MetricHighlight {
    codigo: string;
    gravidade?: string;
    titulo?: string;
    texto?: string;
}

export type SegKey = 'braco_dir' | 'braco_esq' | 'tronco' | 'perna_dir' | 'perna_esq';

export interface WlaSegment {
    key: SegKey;
    fat_kg: number;
    fat_vs_std_pct: number;
    muscle_kg: number;
    muscle_vs_std_pct: number;
}

export interface ScaleMetrics {
    imc?: number;
    imc_status?: string;
    gordura_pct?: number;
    gordura_pct_status?: string;
    gordura_kg?: number;
    massa_magra_kg?: number;
    tmb_kcal?: number;
    peso_ideal_kg?: number;
    controle_peso_kg?: number;
    agua_kg?: number;
    agua_pct?: number;
    agua_status?: string;
    musculo_esqueletico_kg?: number;
    musculo_esqueletico_pct?: number;
    musculo_kg?: number;
    gordura_visceral?: number;
    gordura_visceral_status?: string;
    idade_corporal?: number;
    musculo_pct?: number;
    osso_kg?: number;
    score?: number;
    score_wla25?: number;
    metodo?: string;
    versao?: number;
    aviso?: string;
    z_corpo_ohm?: number;
    z_20khz?: number[];
    z_100khz?: number[];
    equilibrio?: { bracos_diff_pct?: number; pernas_diff_pct?: number };
    gordura_subcutanea_pct?: number;
    proteina_pct?: number;
    proteina_kg?: number;
    proteina_status?: string;
    smi?: number;
    tipo_corporal?: string;
    destaques?: MetricHighlight[];
    musculo_esqueletico_status?: string;
    musculo_status?: string;
    massa_magra_status?: string;
    controle_gordura_kg?: number;
    controle_musculo_kg?: number;
    faixas_kg?: {
        gordura?: number[];
        agua?: number[];
        musculo?: number[];
        esqueletico?: number[];
        proteina?: number[];
        magra?: number[];
    };
    segmentos_wla?: WlaSegment[];
}

export interface BiaSegment {
    name: string;
    side: string;
    freq_khz: number;
    ohm: number;
}

export interface MeasurementRecord {
    id: string;
    user_id: string;
    session_id: string;
    device_id: string | null;
    scale_name: string;
    adapter: string;
    weight_kg: number;
    height_cm: number;
    age: number;
    birth_date: string | null;
    sex: string;
    people_type: string;
    expected_weight_kg: number | null;
    stable: boolean;
    complete: boolean;
    impedances_ohm: number[] | null;
    segments: BiaSegment[] | null;
    metrics: ScaleMetrics | null;
    created_at: string;
}

export interface MeasurementPayload {
    user_id: string;
    session_id?: string | null;
    device_id?: string | null;
    scale_name: string;
    adapter: string;
    weight_kg: number;
    height_cm: number;
    age: number;
    birth_date?: string | null;
    sex: string;
    people_type: string;
    expected_weight_kg?: number | null;
    stable: boolean;
    complete: boolean;
    impedances_ohm?: number[] | null;
    segments?: BiaSegment[] | null;
    metrics: ScaleMetrics | null;
}

/** WebSocket `/ws/scale` payload (not the CRUD `ScalePayload`). */
export interface ScaleLiveMessage {
    type: string;
    step?: string;
    reset?: boolean;
    scale_name?: string;
    weight_kg?: number;
    timestamp?: string;
    msg?: string;
    stable?: boolean;
    complete?: boolean;
    metrics?: ScaleMetrics;
    impedances_ohm?: number[];
    segments?: BiaSegment[];
}

/** Last `WEIGHT` frame kept by the scale pages until it is saved. */
export interface ScaleLiveReading {
    weight_kg: number;
    stable: boolean;
    complete: boolean;
    metrics?: ScaleMetrics | null;
    impedances_ohm?: number[];
    segments?: BiaSegment[];
    scale_name?: string;
}

export function hasBiaImpedances(values?: number[] | null): boolean {
    if (!values || values.length < 8) return false;
    return values.filter((z) => z >= 5).length >= 4;
}

export function hasBodyCompositionMetrics(metrics?: ScaleMetrics | null): boolean {
    if (!metrics) return false;
    return [
        metrics.gordura_pct,
        metrics.gordura_kg,
        metrics.massa_magra_kg,
        metrics.agua_pct,
        metrics.agua_kg,
        metrics.musculo_esqueletico_kg,
        metrics.musculo_esqueletico_pct,
        metrics.musculo_kg,
        metrics.gordura_visceral,
        metrics.osso_kg,
    ].some((value) => value != null);
}

export function isWeightOnlyReport(record: {
    adapter?: string | null;
    complete?: boolean;
    impedances_ohm?: number[] | null;
    metrics?: ScaleMetrics | null;
}): boolean {
    if (hasBiaImpedances(record.impedances_ohm)) return false;
    if (record.metrics?.metodo === 'wla25' || hasBodyCompositionMetrics(record.metrics)) return false;
    return record.adapter === 'ble_rm_rd2504a' || !record.complete;
}
