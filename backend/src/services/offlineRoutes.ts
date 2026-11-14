import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  distanceM,
  OfflineRoutesSnapshot,
  type Coordinate,
  type NavigationRoute,
  type RoutesResponse,
} from '@vlaiq/shared';

/**
 * Saved DEMO routes (spec §6.8), written by `pnpm data:demo-routes`. They are real provider routes;
 * they are served only when the provider fails and both endpoints are within MATCH_M of a saved pair,
 * and every one says it is a saved copy and when it was saved.
 */
export const MATCH_M = 40;

function load(): OfflineRoutesSnapshot | null {
  const file = fileURLToPath(new URL('../../../shared/src/data/demo-routes.json', import.meta.url));
  if (!existsSync(file)) {
    console.warn('[offline] demo-routes.json not found. Run `pnpm data:demo-routes` with the backend running.');
    return null;
  }
  const parsed = OfflineRoutesSnapshot.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) {
    console.error('[offline] demo-routes.json does not match the schema:', parsed.error.issues.slice(0, 3));
    return null;
  }
  return parsed.data;
}

let snapshot: OfflineRoutesSnapshot | null | undefined;
const data = () => (snapshot === undefined ? (snapshot = load()) : snapshot);
/** Tests replace the snapshot. */
export function setOfflineSnapshot(value: OfflineRoutesSnapshot | null) {
  snapshot = value;
}

const savedDay = (iso: string) =>
  new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Bucharest' }).format(
    new Date(iso),
  );
const near = (a: Coordinate, b: Coordinate) => distanceM(a, b) <= MATCH_M;
const label = (route: NavigationRoute, savedAt: string): NavigationRoute => ({
  ...route,
  source: `${route.source} · copie salvată pe ${savedDay(savedAt)} (furnizorul nu răspunde)`,
});

export function offlineDriving(origin: Coordinate, destination: Coordinate): RoutesResponse | null {
  const s = data();
  const hit = s?.driving.find((p) => near(p.origin, origin) && near(p.destination, destination));
  if (!s || !hit) return null;
  return { routes: hit.routes.map((r) => label(r, s.savedAt)), offline: { savedAt: s.savedAt } };
}

export function offlineWalking(origin: Coordinate, destination: Coordinate): NavigationRoute | null {
  const s = data();
  const hit = s?.walking.find((p) => near(p.origin, origin) && near(p.destination, destination));
  return s && hit ? label(hit.route, s.savedAt) : null;
}
