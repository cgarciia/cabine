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
    gordura_visceral?: number;
    idade_corporal?: number;
    musculo_pct?: number;
    osso_kg?: number;
    score?: number;
    metodo?: string;
    aviso?: string;
    z_corpo_ohm?: number;
    equilibrio?: { bracos_diff_pct?: number; pernas_diff_pct?: number };
}

export interface Segmento {
    nome: string;
    lado: string;
    freq_khz: number;
    ohm: number;
}

export interface MeasurementRecord {
    id: string;
    person_id: string;
    scale_id: string | null;
    scale_name: string;
    adapter: string;
    peso_kg: number;
    height_cm: number;
    age: number;
    birth_date: string | null;
    sex: string;
    people_type: string;
    expected_weight_kg: number | null;
    estavel: boolean;
    completo: boolean;
    impedancias_ohm: number[] | null;
    segmentos: Segmento[] | null;
    metricas: ScaleMetrics | null;
    created_at: string;
}

export interface MeasurementPayload {
    person_id: string;
    scale_id?: string | null;
    scale_name: string;
    adapter: string;
    peso_kg: number;
    height_cm: number;
    age: number;
    birth_date?: string | null;
    sex: string;
    people_type: string;
    expected_weight_kg?: number | null;
    estavel: boolean;
    completo: boolean;
    impedancias_ohm?: number[] | null;
    segmentos?: Segmento[] | null;
    metricas: ScaleMetrics | null;
}
