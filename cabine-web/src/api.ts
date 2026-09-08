import axios from 'axios';

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
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
