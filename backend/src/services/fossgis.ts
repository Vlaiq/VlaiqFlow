import type { Coordinate, NavigationRoute } from '@vlaiq/shared';
import { parseOsrmRoutes } from './routing';

/**
 * Keyless walking and cycling routes from the FOSSGIS OSRM server (routing.openstreetmap.de), used only
 * when ORS_API_KEY is missing. Real street geometry, never a straight line.
 *
 * Usage policy (https://routing.openstreetmap.de/about.html): at most one request per second, a valid
 * User-Agent, no heavy usage, OSM attribution plus a "fix the map" link (shown on the map). Every call
 * goes through one queue spaced FOSSGIS_POLICY.minIntervalMs apart; callers cache the results. When the
 * queue is full we fail fast instead of piling up requests on a volunteer-run server.
 */
export const FOSSGIS_POLICY = { minIntervalMs: 1100, maxQueued: 12, timeoutMs: 15000 } as const;
export const FOSSGIS_USER_AGENT =
  'VLAIQ-UniHack2026-team (VLAIQ FLOW student prototype; https://github.com/Vlaiq/VlaiqFlow)';
const profile = { walk: 'routed-foot', cycle: 'routed-bike' } as const;
export const fossgisSource = {
  walk: 'OSRM FOSSGIS pe jos (routing.openstreetmap.de) · OpenStreetMap',
  cycle: 'OSRM FOSSGIS bicicletă (routing.openstreetmap.de) · OpenStreetMap',
} as const;

let nextSlot = 0;
let queued = 0;

/** Reserves the next free one-per-second slot and waits for it. */
async function throttle(now = Date.now()) {
  if (queued >= FOSSGIS_POLICY.maxQueued) throw new Error('FOSSGIS_BUSY');
  queued++;
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + FOSSGIS_POLICY.minIntervalMs;
  try {
    if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
  } finally {
    queued--;
  }
}

export async function fossgisRoute(
  mode: 'walk' | 'cycle',
  from: Coordinate,
  to: Coordinate,
): Promise<NavigationRoute> {
  await throttle();
  const url = `https://routing.openstreetmap.de/${profile[mode]}/route/v1/driving/${from.join(',')};${to.join(',')}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FOSSGIS_POLICY.timeoutMs),
    headers: { 'User-Agent': FOSSGIS_USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`FOSSGIS HTTP ${res.status}`);
  const route = parseOsrmRoutes(await res.json(), `fossgis-${mode}`, fossgisSource[mode])[0];
  if (!route) throw new Error('FOSSGIS_NO_ROUTE');
  return route;
}

/** Test hook: forget queued slots between tests. */
export function resetFossgisQueue() {
  nextSlot = 0;
  queued = 0;
}
