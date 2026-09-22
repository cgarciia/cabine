import axios from 'axios';

import {
  clearAccessSession,
  getAccessToken,
  isAccessSessionValid,
  saveAccessSession,
} from './session/auth';
import type {
  PersonListResponse,
  ProfessionalUser,
  ScalePerson,
  VisitListResponse,
} from './types';

export function apiBaseUrl() {
  const env = import.meta.env.VITE_API_URL as string | undefined;
  if (env) return env.replace(/\/$/, '');
  return '';
}

export const api = axios.create({
  baseURL: apiBaseUrl(),
  timeout: 15000,
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
    if (status === 401 && !url.includes('/login') && !url.includes('/professionals/register')) {
      clearAccessSession();
      if (window.location.pathname !== '/login' && window.location.pathname !== '/cadastro') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

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

export async function loginProfessional(email: string, password: string) {
  const body = new URLSearchParams();
  body.set('username', email);
  body.set('password', password);
  const { data } = await api.post<{ access_token: string; expires_in: number }>('/login', body);
  saveAccessSession(data.access_token, data.expires_in);
  const me = await fetchMe();
  if (me.role !== 'professional') {
    clearAccessSession();
    throw new Error('Esta conta não é de profissional de saúde.');
  }
  saveAccessSession(data.access_token, data.expires_in, me);
  return me;
}

export async function registerProfessional(payload: {
  email: string;
  password: string;
  full_name: string;
  crm: string;
}) {
  const { data } = await api.post<{
    access_token: string;
    expires_in: number;
    user: ProfessionalUser;
  }>('/professionals/register', payload);
  saveAccessSession(data.access_token, data.expires_in, data.user);
  return data.user;
}

export async function fetchMe(): Promise<ProfessionalUser> {
  const { data } = await api.get<ProfessionalUser>('/users/me');
  return data;
}

export async function fetchPeople(params: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<PersonListResponse> {
  const { data } = await api.get<PersonListResponse>('/people', { params });
  return data;
}

export async function fetchPerson(personId: string): Promise<ScalePerson> {
  const { data } = await api.get<ScalePerson>(`/people/${encodeURIComponent(personId)}`);
  return data;
}

export async function fetchPersonVisits(
  personId: string,
  params?: { limit?: number; offset?: number },
): Promise<VisitListResponse> {
  const { data } = await api.get<VisitListResponse>(
    `/people/${encodeURIComponent(personId)}/visits`,
    { params },
  );
  return data;
}
