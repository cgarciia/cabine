import type { ProfessionalUser } from '../types';

const TOKEN_KEY = 'profissional.token';
const EXPIRES_KEY = 'profissional.token-expires-at';
const USER_KEY = 'profissional.user';

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): ProfessionalUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProfessionalUser;
  } catch {
    return null;
  }
}

export function isAccessSessionValid(): boolean {
  const token = getAccessToken();
  if (!token) return false;
  const expiresAt = Number(localStorage.getItem(EXPIRES_KEY) || 0);
  if (!expiresAt) return true;
  return Date.now() < expiresAt - 10_000;
}

export function saveAccessSession(token: string, expiresIn: number, user?: ProfessionalUser | null) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRES_KEY, String(Date.now() + expiresIn * 1000));
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAccessSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  localStorage.removeItem(USER_KEY);
}
