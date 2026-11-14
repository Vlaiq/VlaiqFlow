import { z } from 'zod';
import { RoutesResponse, type Coordinate, type NavigationRoute } from '@vlaiq/shared';
import { config } from '../config';

// No arbitrary upstream URL is accepted from clients. Keys never leave the server.
const coord = z.tuple([z.number(), z.number()]);
const osrmResponse = z.object({
  code: z.literal('Ok'),
  routes: z.array(
    z.object({
      distance: z.number(),
      duration: z.number(),
      geometry: z.object({ type: z.literal('LineString'), coordinates: z.array(coord) }),
      legs: z.array(
        z.object({
          steps: z.array(
            z.object({
              name: z.string(),
              maneuver: z.object({
                location: coord,
                type: z.string(),
                modifier: z.string().optional(),
              }),
            }),
          ),
        }),
      ),
    }),
  ),
});
const orsResponse = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ type: z.literal('LineString'), coordinates: z.array(coord) }),
      properties: z.object({
        summary: z.object({ distance: z.number(), duration: z.number() }),
        segments: z.array(
          z.object({
            steps: z.array(
              z.object({
                type: z.number(),
                name: z.string(),
                way_points: z.array(z.number()),
              }),
            ),
          }),
        ),
      }),
    }),
  ),
});
const orsTypes: Record<number, [string, string?]> = {
  0: ['turn', 'left'],
  1: ['turn', 'right'],
  2: ['turn', 'sharp left'],
  3: ['turn', 'sharp right'],
  4: ['turn', 'slight left'],
  5: ['turn', 'slight right'],
  6: ['continue'],
  7: ['roundabout'],
  8: ['exit roundabout'],
  9: ['turn', 'uturn'],
  10: ['arrive'],
  11: ['depart'],
  12: ['fork'],
};
const cache = new Map<string, { expires: number; result: RoutesResponse }>();
const pending = new Map<string, Promise<RoutesResponse>>();

async function requestRoutes(origin: Coordinate, destination: Coordinate): Promise<RoutesResponse> {
  if (config.orsApiKey) {
    const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: config.orsApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: [origin, destination], instructions: true }),
    });
    if (!res.ok) throw new Error('Routing provider unavailable');
    const body = orsResponse.parse(await res.json());
    return RoutesResponse.parse({
      routes: body.features.slice(0, 3).map((f, i) => ({
        id: `ors-${i}`,
        ...f.properties.summary,
        geometry: f.geometry.coordinates,
        steps: f.properties.segments.flatMap((s) =>
          s.steps.map((step) => {
            const [type, modifier] = orsTypes[step.type] ?? ['continue'];
            return {
              index: step.way_points[0],
              type,
              modifier,
              road: step.name === '-' ? '' : step.name,
            };
          }),
        ),
        source: 'openrouteservice · OpenStreetMap',
        quality: 'estimated',
      })),
    });
  }
  // Low-volume prototype fallback; no live traffic or speed-limit claims.
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.join(',')};${destination.join(',')}?overview=full&geometries=geojson&steps=true&alternatives=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('Routing provider unavailable');
  const routes = parseOsrmRoutes(
    await res.json(),
    'osrm',
    'OSRM · OpenStreetMap (serviciu demonstrativ)',
  );
  return RoutesResponse.parse({ routes });
}

/** Turns an OSRM `route` response into our routes, keeping the provider geometry untouched. */
export function parseOsrmRoutes(json: unknown, idPrefix: string, source: string): NavigationRoute[] {
  const body = osrmResponse.parse(json);
  return body.routes.slice(0, 3).map((r, i) => ({
    id: `${idPrefix}-${i}`,
    distance: r.distance,
    duration: r.duration,
    geometry: r.geometry.coordinates,
    steps: r.legs.flatMap((l) =>
      l.steps.map((s) => {
        let index = 0,
          best = Infinity;
        r.geometry.coordinates.forEach((c, j) => {
          const d = (c[0] - s.maneuver.location[0]) ** 2 + (c[1] - s.maneuver.location[1]) ** 2;
          if (d < best) {
            index = j;
            best = d;
          }
        });
        return { index, type: s.maneuver.type, modifier: s.maneuver.modifier, road: s.name };
      }),
    ),
    source,
    quality: 'estimated' as const,
  }));
}

export async function getRoutes(
  origin: Coordinate,
  destination: Coordinate,
): Promise<RoutesResponse> {
  const key = JSON.stringify([origin, destination].map((c) => c.map((n) => +n.toFixed(5))));
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.result;
  const running = pending.get(key);
  if (running) return running;
  const job = requestRoutes(origin, destination)
    .then((result) => {
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, { result, expires: Date.now() + 300000 });
      return result;
    })
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
