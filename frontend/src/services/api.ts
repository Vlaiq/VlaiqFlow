import { HealthResponse, ParkingsResponse, TimparkSnapshot } from '@vlaiq/shared';
import type { z } from 'zod';

// In dev the base is empty and Vite proxies /api to the backend.
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const TIMEOUT_MS = 8000;

async function get<S extends z.ZodTypeAny>(path: string, schema: S): Promise<z.infer<S>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return schema.parse(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  health: () => get('/api/health', HealthResponse),
  parkings: () => get('/api/parkings', ParkingsResponse),
  timpark: () => get('/api/city/parking-zones', TimparkSnapshot),
};
