import { z } from 'zod';
import { distanceM, type Coordinate, type RecommendationOption } from '@vlaiq/shared';
import { config } from '../config';
import { reportRoutingFailure, RoutingHttpError } from './routingDiagnostics';

type Walk = RecommendationOption['walk'];

/** Without a pedestrian router: straight line × 1.3 (typical street-grid detour) at 4.8 km/h. */
export const DETOUR_FACTOR = 1.3;
export const WALK_M_PER_MIN = 80;

export function estimatedWalk(from: Coordinate, to: Coordinate): Walk {
  const meters = Math.round(distanceM(from, to) * DETOUR_FACTOR);
  return {
    meters,
    minutes: Math.round((meters / WALK_M_PER_MIN) * 10) / 10,
    quality: 'estimated',
    source: 'estimat: distanța în linie dreaptă × 1,3, la 4,8 km/h',
  };
}

const orsMatrix = z.object({
  durations: z.array(z.array(z.number().finite().nonnegative().nullable())),
  distances: z.array(z.array(z.number().finite().nonnegative().nullable())),
});

const cache = new Map<string, { expires: number; walks: Walk[] }>();
const pending = new Map<string, Promise<Walk[]>>();
const TTL_MS = 30 * 60_000;
const key = (c: Coordinate) => `${c[0].toFixed(5)},${c[1].toFixed(5)}`;

/**
 * Walking time from each parking to the destination.
 * openrouteservice foot-walking matrix when ORS_API_KEY is set (one call, cached); otherwise, or if
 * the provider fails, the labelled straight-line estimate. Never blocks the recommendation.
 */
export async function walkTimes(destination: Coordinate, points: Coordinate[]): Promise<Walk[]> {
  if (points.length === 0) return [];
  const fallback = () => points.map((p) => estimatedWalk(p, destination));
  const apiKey = config.orsApiKey;
  if (!apiKey) return fallback();

  const cacheKey = [destination, ...points].map(key).join(';');
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.walks;
  const running = pending.get(cacheKey);
  if (running) return running;
  const job = (async () => {
    try {
      const res = await fetch('https://api.heigit.org/openrouteservice/v2/matrix/foot-walking', {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: [destination, ...points],
          sources: points.map((_, i) => i + 1),
          destinations: [0],
          metrics: ['duration', 'distance'],
        }),
      });
      if (!res.ok) throw new RoutingHttpError(res.status);
      const body = orsMatrix.parse(await res.json());
      const walks = points.map((p, i): Walk => {
        const s = body.durations[i]?.[0];
        const m = body.distances[i]?.[0];
        if (s == null || m == null) return estimatedWalk(p, destination);
        return {
          minutes: Math.round((s / 60) * 10) / 10,
          meters: Math.round(m),
          quality: 'estimated',
          source: 'openrouteservice (pe jos) · OpenStreetMap',
        };
      });
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, { walks, expires: Date.now() + TTL_MS });
      return walks;
    } catch (e) {
      reportRoutingFailure('ors', 'foot-walking', 'matrix', e);
      const walks = fallback();
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, { walks, expires: Date.now() + 15000 });
      return walks;
    }
  })().finally(() => pending.delete(cacheKey));
  pending.set(cacheKey, job);
  return job;
}
