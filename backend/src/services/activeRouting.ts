import { distanceM, type Coordinate, type JourneyOption } from '@vlaiq/shared';
import { requestActiveRoute } from './journeys';
const cache = new Map<string, { expires: number; value: JourneyOption }>();
const pending = new Map<string, Promise<JourneyOption>>();
/** Reject misrouted endpoints; allow at most 250 m of provider snapping, disclosed in the UI. */
export function validateEndpoints(geometry: Coordinate[], from: Coordinate, to: Coordinate) {
  if (distanceM(geometry[0]!, from) > 250 || distanceM(geometry.at(-1)!, to) > 250)
    throw new Error('ROUTE_ENDPOINT_MISMATCH');
}
export async function activeDirections(mode: 'walk' | 'cycle', from: Coordinate, to: Coordinate) {
  const key = JSON.stringify([mode, from, to]);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const running = pending.get(key);
  if (running) return running;
  const job = requestActiveRoute(mode, from, to)
    .then((value) => {
      validateEndpoints(value.route.geometry, from, to);
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, { value, expires: Date.now() + 300000 });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
