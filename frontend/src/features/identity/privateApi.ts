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
/**
 * No sign-in by default (VITE_FLOW_ACCOUNTS unset or `local`): this browser gets a random ID that
 * ties its profile, wallet and voice memory to it on the FLOW server. `auth0` turns sign-in back on.
 */
export const localAccounts = () => import.meta.env.VITE_FLOW_ACCOUNTS !== 'auth0';
export const LOCAL_ACCOUNTS = localAccounts();
const DEVICE_KEY = 'vlaiq-flow-device';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let memoryDevice: string | null = null;
export function deviceId(): string {
  try {
    const saved = window.localStorage.getItem(DEVICE_KEY);
    if (saved && UUID.test(saved)) return saved;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    // Private mode: one ID for this page only.
    return (memoryDevice ??= crypto.randomUUID());
  }
}
/** A new, empty identity for this browser (after "Șterge datele FLOW"). */
export function resetDeviceId() {
  memoryDevice = null;
  try {
    window.localStorage.removeItem(DEVICE_KEY);
  } catch {}
}
export async function privateFetch(url: string, init: RequestInit = {}) {
  if (localAccounts()) {
    const headers = new Headers(init.headers);
    headers.set('X-Flow-Device', deviceId());
    return apiFetch(url, {
      ...init,
      headers,
      cache: 'no-store',
      credentials: 'omit',
      signal: init.signal ?? AbortSignal.timeout(15000),
    });
  }
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
