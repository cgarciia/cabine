import axios from 'axios';

import { clearAccessSession, getAccessToken, isAccessSessionValid } from './session/authSession';
import type { BloodPressureReading } from './types/bloodPressure';
import type { FormSubmission } from './types/form';
import type { MeasurementPayload, MeasurementRecord } from './types/measurement';
import type { OximeterReading } from './types/oximeter';
import type { PersonPayload, ScalePerson } from './types/person';
import type { Scale, ScaleCatalog, ScalePayload } from './types/scale';

export function apiBaseUrl() {
    const env = import.meta.env.VITE_API_URL as string | undefined;
    if (env) return env.replace(/\/$/, '');
    return '';
}

export function wsBaseUrl() {
    const env = import.meta.env.VITE_API_URL as string | undefined;
    if (env) return env.replace(/^http/, 'ws').replace(/\/$/, '');
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}`;
}

export const api = axios.create({
    baseURL: apiBaseUrl(),
    timeout: 10000,
});

api.interceptors.request.use((config) => {
    const token = getAccessToken();
    if (token && isAccessSessionValid()) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        const url = axios.isAxiosError(error) ? String(error.config?.url || '') : '';
        if (status === 401 && !url.includes('/login')) {
            clearAccessSession();
            const onAdmin = window.location.pathname.startsWith('/admin');
            const stay = onAdmin
                ? window.location.pathname === '/admin/login'
                : window.location.pathname === '/matricula' || window.location.pathname === '/cadastro';
            if (!stay) {
                window.location.assign(onAdmin ? '/admin/login' : '/matricula');
            }
        }
        return Promise.reject(error);
    },
);

export function withAccessToken(params: URLSearchParams): URLSearchParams {
    const token = getAccessToken();
    if (token && isAccessSessionValid()) {
        params.set('token', token);
    }
    return params;
}

export const WS_PATHS = {
    scale: '/ws/scale',
    oximeter: '/ws/oximeter',
    bloodPressure: '/ws/blood-pressure',
} as const;

export type WsPath = (typeof WS_PATHS)[keyof typeof WS_PATHS];

export function deviceSocket(path: WsPath, params: URLSearchParams): WebSocket {
    return new WebSocket(`${wsBaseUrl()}${path}?${withAccessToken(params).toString()}`);
}

export function apiErrorMessage(error: unknown, fallback: string): string {
    if (axios.isAxiosError(error)) {
        const detail = error.response?.data?.detail;
        if (typeof detail === 'string') return detail;
        if (Array.isArray(detail)) {
            return detail
                .map((item) => (typeof item === 'string' ? item : item.msg))
                .filter(Boolean)
                .join(' ');
        }
        if (!error.response) {
            return 'Não foi possível falar com o servidor. Confira se a API está ligada.';
        }
    }
    return fallback;
}

export type RegistrationSession = {
    access_token: string;
    expires_in: number;
    person: ScalePerson;
};

export async function lookupRegistration(registration: string): Promise<{ exists: boolean }> {
    const { data } = await api.post<{ exists: boolean }>('/login/lookup', {
        registration: registration,
    });
    return data;
}

export async function loginByRegistration(
    registration: string,
    birthDate: string,
): Promise<RegistrationSession> {
    const { data } = await api.post<RegistrationSession>('/login/registration', {
        registration: registration,
        birth_date: birthDate,
    });
    return data;
}

export async function loginOperator(email: string, password: string): Promise<{
    access_token: string;
    expires_in: number;
}> {
    const body = new URLSearchParams();
    body.set('username', email);
    body.set('password', password);
    const { data } = await api.post<{ access_token: string; expires_in: number }>('/login', body);
    return data;
}

export async function fetchPeople(): Promise<ScalePerson[]> {
    const { data } = await api.get<ScalePerson[]>('/people');
    return Array.isArray(data) ? data : [];
}

export async function createPerson(body: PersonPayload): Promise<ScalePerson> {
    const { data } = await api.post<ScalePerson>('/people', body);
    return data;
}

export async function updatePerson(personId: string, body: Partial<PersonPayload>): Promise<ScalePerson> {
    const { data } = await api.patch<ScalePerson>(`/people/${encodeURIComponent(personId)}`, body);
    return data;
}

export async function deletePerson(personId: string): Promise<void> {
    await api.delete(`/people/${encodeURIComponent(personId)}`);
}

export async function fetchScales(): Promise<Scale[]> {
    const { data } = await api.get<Scale[]>('/scales');
    return Array.isArray(data) ? data : [];
}

/** Default active scale first, then any active one, then whatever exists. */
export function pickPreferredScale(scales: Scale[]): Scale | null {
    return scales.find((item) => item.is_default && item.is_active)
        ?? scales.find((item) => item.is_active)
        ?? scales[0]
        ?? null;
}

export async function fetchScaleCatalog(): Promise<ScaleCatalog> {
    const { data } = await api.get<ScaleCatalog>('/scales/catalog');
    return data;
}

export async function createScale(body: ScalePayload): Promise<Scale> {
    const { data } = await api.post<Scale>('/scales', body);
    return data;
}

export async function updateScale(scaleId: string, body: Partial<ScalePayload>): Promise<Scale> {
    const { data } = await api.patch<Scale>(`/scales/${encodeURIComponent(scaleId)}`, body);
    return data;
}

export async function deleteScale(scaleId: string): Promise<void> {
    await api.delete(`/scales/${encodeURIComponent(scaleId)}`);
}

export async function saveMeasurement(body: MeasurementPayload): Promise<MeasurementRecord> {
    const { data } = await api.post<MeasurementRecord>('/measurements', body);
    return data;
}

export async function fetchPersonMeasurements(personId: string): Promise<MeasurementRecord[]> {
    const id = encodeURIComponent(personId);
    const { data } = await api.get<MeasurementRecord[]>(`/people/${id}/measurements`);
    return Array.isArray(data) ? data : [];
}

export async function saveFormSubmission(body: {
    person_id: string;
    module: 'health' | 'mental';
    status: string;
    payload: Record<string, unknown>;
    visit_id?: string | null;
}): Promise<FormSubmission> {
    const { data } = await api.post<FormSubmission>('/forms', body);
    return data;
}

export async function fetchPersonForms(personId: string): Promise<FormSubmission[]> {
    const id = encodeURIComponent(personId);
    const { data } = await api.get<FormSubmission[]>(`/people/${id}/forms`);
    return Array.isArray(data) ? data : [];
}

export async function fetchPersonOximeter(personId: string): Promise<OximeterReading[]> {
    const id = encodeURIComponent(personId);
    const { data } = await api.get<OximeterReading[]>(`/people/${id}/oximeter`);
    return Array.isArray(data) ? data : [];
}

export async function fetchPersonBloodPressure(personId: string): Promise<BloodPressureReading[]> {
    const id = encodeURIComponent(personId);
    const { data } = await api.get<BloodPressureReading[]>(`/people/${id}/blood-pressure`);
    return Array.isArray(data) ? data : [];
}

export async function saveBloodPressureReading(body: {
    person_id: string;
    device_name: string;
    device_address?: string | null;
    sys_mmhg: number;
    dia_mmhg: number;
    pulse_bpm: number;
    movement?: boolean;
    irregular_heartbeat?: boolean;
    measured_at: string;
    visit_id?: string | null;
}): Promise<BloodPressureReading> {
    const { data } = await api.post<BloodPressureReading>('/blood-pressures', body);
    return data;
}

export async function saveOximeterReading(body: {
    person_id: string;
    device_name: string;
    device_address?: string | null;
    spo2_pct: number;
    pulse_bpm: number;
    pi_pct?: number | null;
    stable?: boolean;
    waveform?: number[] | null;
    visit_id?: string | null;
}): Promise<OximeterReading> {
    const { data } = await api.post<OximeterReading>('/oximeters', body);
    return data;
}
