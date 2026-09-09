import axios from 'axios';

import type { MeasurementRecord } from './types/measurement';

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
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

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
    }
    return fallback;
}

function asMeasurementList(data: unknown): MeasurementRecord[] {
    return Array.isArray(data) ? data : [];
}

export async function fetchPersonMeasurements(personId: string): Promise<MeasurementRecord[]> {
    const id = encodeURIComponent(personId);
    const attempts = [
        () => api.get(`/people/${id}/measurements`),
        () => api.get('/measurements', { params: { person_id: personId } }),
        () => api.get(`/measurements/person/${id}`),
    ];
    let last: MeasurementRecord[] = [];
    let lastError: unknown;
    for (const run of attempts) {
        try {
            const { data } = await run();
            last = asMeasurementList(data);
            if (last.length > 0) return last;
        } catch (err) {
            lastError = err;
        }
    }
    if (lastError && last.length === 0) {
        throw lastError;
    }
    return last;
}
