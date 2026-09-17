export type MentalInstrumentId = 'HAD' | 'AUDIT' | 'WHO-5';

export interface MentalResult {
    instrument: MentalInstrumentId;
    score: number;
    hadA?: number;
    hadD?: number;
    band: string;
    tone: 'ok' | 'watch' | 'alert';
}

export interface MentalItemLog {
    id: string;
    text: string;
    label: string;
    score: number;
}

export interface MentalInstrumentLog {
    instrument: MentalInstrumentId;
    items: MentalItemLog[];
}
