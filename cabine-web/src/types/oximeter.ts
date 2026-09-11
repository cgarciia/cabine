export interface OximeterDevice {
    name: string;
    address: string;
    rssi: number | null;
}

export interface OximeterReading {
    id: string;
    person_id: string;
    device_name: string;
    device_address: string | null;
    spo2_pct: number;
    pulse_bpm: number;
    pi_pct: number | null;
    stable: boolean;
    created_at: string;
    updated_at: string;
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
    waveform?: number[];
    timestamp?: string;
    msg?: string;
}
