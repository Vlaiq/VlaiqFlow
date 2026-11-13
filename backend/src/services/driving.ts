import { z } from 'zod';
import type { Coordinate, RecommendationOption } from '@vlaiq/shared';
import { config } from '../config';

type Drive = NonNullable<RecommendationOption['drive']>;
const Matrix = z.object({
  durations: z.array(z.array(z.number().finite().nonnegative().nullable())),
  distances: z.array(z.array(z.number().finite().nonnegative().nullable())),
});
const cache = new Map<string, { expires: number; values: Drive[] }>();
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
  if (!origin || !config.orsApiKey || !destinations.length) return destinations.map(unknown);
  const key = JSON.stringify([origin, ...destinations]);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.values;
  try {
    const response = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: config.orsApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [origin, ...destinations],
        sources: [0],
        destinations: destinations.map((_, i) => i + 1),
        metrics: ['duration', 'distance'],
      }),
    });
    if (!response.ok) return destinations.map(unknown);
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
  } catch {
    return destinations.map(unknown);
  }
}
