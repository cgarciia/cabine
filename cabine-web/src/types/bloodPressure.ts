export interface BloodPressureReading {
    id: string;
    person_id: string;
    device_name: string;
    device_address: string | null;
    sys_mmhg: number;
    dia_mmhg: number;
    pulse_bpm: number;
    movement: boolean;
    irregular_heartbeat: boolean;
    measured_at: string;
    visit_id?: string | null;
    created_at: string;
    updated_at: string;
    /** Traço de ECG da sessão (mV). Fica no totem/relatório, não no POST da API. */
    ecg_mv?: number[];
}

export interface BloodPressureLive {
    type: 'STATUS' | 'BLOOD_PRESSURE';
    msg?: string;
    device_name?: string;
    device_address?: string | null;
    sys_mmhg?: number;
    dia_mmhg?: number;
    pulse_bpm?: number;
    movement?: boolean;
    irregular_heartbeat?: boolean;
    measured_at?: string;
    stable?: boolean;
}
