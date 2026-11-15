import { apiFetch } from '../../services/http';
let tokenGetter: (() => Promise<string>) | null = null;
let generation = 0;
export function setTokenGetter(getter: (() => Promise<string>) | null) {
  tokenGetter = getter;
  generation++;
}
export class SessionRequired extends Error {
  constructor() {
    super('Sesiunea a expirat. Conectează-te din nou.');
  }
}
export async function privateFetch(url: string, init: RequestInit = {}) {
  const epoch = generation;
  const getter = tokenGetter;
  if (!getter) throw new SessionRequired();
  let token: string;
  try {
    token = await getter();
  } catch {
    window.dispatchEvent(new Event('flow-session-expired'));
    throw new SessionRequired();
  }
  if (epoch !== generation) throw new SessionRequired();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const response = await apiFetch(url, {
    ...init,
    headers,
    cache: 'no-store',
    credentials: 'omit',
    signal: init.signal ?? AbortSignal.timeout(15000),
  });
  if (epoch !== generation) throw new SessionRequired();
  if (response.status === 401) {
    window.dispatchEvent(new Event('flow-session-expired'));
    throw new SessionRequired();
  }
  return response;
}
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export async function accountCall(path: string, init?: RequestInit) {
  const res = await privateFetch(`${API_BASE}/api${path}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(body?.error?.message ?? 'Datele contului nu sunt disponibile. Reîncearcă.');
  return body;
}
