import { z } from 'zod';
import type { Coordinate, RecommendationOption } from '@vlaiq/shared';
import { config } from '../config';
import { reportRoutingFailure, RoutingHttpError } from './routingDiagnostics';

type Drive = NonNullable<RecommendationOption['drive']>;
const Matrix = z.object({
  durations: z.array(z.array(z.number().finite().nonnegative().nullable())),
  distances: z.array(z.array(z.number().finite().nonnegative().nullable())),
});
const cache = new Map<string, { expires: number; values: Drive[] }>();
const pending = new Map<string, Promise<Drive[]>>();
const unknown = (): Drive => ({
  minutes: null,
  meters: null,
  quality: 'unknown',
  source: 'Rută auto indisponibilă · este necesar un furnizor de rutare configurat.',
});
/** One bounded matrix, never a straight-line driving-time invention. */
export async function driveTimes(
  origin: Coordinate | undefined,
  destinations: Coordinate[],
): Promise<Drive[]> {
  const apiKey = config.orsApiKey;
  if (!origin || !apiKey || !destinations.length) return destinations.map(unknown);
  const key = JSON.stringify([origin, ...destinations]);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.values;
  const running = pending.get(key);
  if (running) return running;
  const failed = () => {
    const values = destinations.map(unknown);
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + 15000, values });
    return values;
  };
  const job = (async () => {
    try {
      const response = await fetch('https://api.heigit.org/openrouteservice/v2/matrix/driving-car', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: [origin, ...destinations],
          sources: [0],
          destinations: destinations.map((_, i) => i + 1),
          metrics: ['duration', 'distance'],
        }),
      });
      if (!response.ok) throw new RoutingHttpError(response.status);
      const result = Matrix.parse(await response.json());
      const values = destinations.map((_, i): Drive => {
        const seconds = result.durations[0]?.[i],
          meters = result.distances[0]?.[i];
        return seconds == null || meters == null
          ? unknown()
          : {
              minutes: Math.round(seconds / 6) / 10,
              meters: Math.round(meters),
              quality: 'estimated',
              source: 'openrouteservice driving-car · fără trafic live',
            };
      });
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: Date.now() + 300000, values });
      return values;
    } catch (error) {
      reportRoutingFailure('ors', 'driving-car', 'matrix', error);
      return failed();
    }
  })().finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
