import { DestinationsResponse, HealthResponse, ParkingsResponse, TimparkSnapshot, RoutesResponse, RecommendationResponse, type Coordinate, type RecommendationRequest } from '@vlaiq/shared';
import type { z } from 'zod';

// In dev the base is empty and Vite proxies /api to the backend.
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const TIMEOUT_MS = 8000;

async function get<S extends z.ZodTypeAny>(path: string, schema: S): Promise<z.infer<S>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // 'no-cache' = always revalidate with the server (ETag → cheap 304), never trust a stale stored copy.
    const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal, cache: 'no-cache' });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return schema.parse(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  routes: async (origin: Coordinate, destination: Coordinate, signal?: AbortSignal) => {
    const res = await fetch(`${BASE}/api/navigation/routes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination }), signal: signal ?? AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error?.message ?? 'Nu am putut calcula ruta.');
    }
    return RoutesResponse.parse(await res.json()).routes;
  },
  recommend: async (req: Partial<RecommendationRequest> & Pick<RecommendationRequest, 'destination'>, signal?: AbortSignal) => {
    const res = await fetch(`${BASE}/api/recommendations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req), signal: signal ?? AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error?.message ?? 'Nu am putut calcula recomandarea.');
    }
    return RecommendationResponse.parse(await res.json());
  },
  health: () => get('/api/health', HealthResponse),
  parkings: () => get('/api/parkings', ParkingsResponse),
  timpark: () => get('/api/city/parking-zones', TimparkSnapshot),
  destinations: () => get('/api/destinations', DestinationsResponse),
};
