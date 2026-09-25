export interface OximeterReading {
    id: string;
    person_id: string;
    device_name: string;
    device_address: string | null;
    spo2_pct: number;
    pulse_bpm: number;
    pi_pct: number | null;
    stable: boolean;
    visit_id?: string | null;
    created_at: string;
    updated_at: string;
    /** Amostras da onda de pulso capturadas na sessão (não vêm da API). */
    waveform?: number[] | null;
}

export interface OximeterLive {
    type: string;
    device_name?: string;
    device_address?: string;
    spo2_pct?: number | null;
    pulse_bpm?: number | null;
    pi_pct?: number | null;
    finger_on?: boolean;
    stable?: boolean;
    stable_hits?: number;
    stable_needed?: number;
    waveform?: number[];
    timestamp?: string;
    msg?: string;
}
