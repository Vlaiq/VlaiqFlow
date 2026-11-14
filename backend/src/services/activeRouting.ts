import { type Coordinate, type JourneyOption } from '@vlaiq/shared';
import { requestActiveRoute } from './journeys';
import { validateEndpoints } from './routeValidation';
export { validateEndpoints } from './routeValidation';
const cache = new Map<string, { expires: number; value: JourneyOption }>();
const pending = new Map<string, Promise<JourneyOption>>();
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
