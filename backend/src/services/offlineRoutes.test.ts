import { afterEach, expect, it, vi } from 'vitest';
import { OfflineRoutesSnapshot } from '@vlaiq/shared';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const route = {
  id: 'osrm-0',
  distance: 1500,
  duration: 240,
  geometry: [
    [21.2072, 45.7511],
    [21.215, 45.752],
    [21.2253, 45.7528],
  ],
  steps: [
    { index: 0, type: 'depart', road: '' },
    { index: 2, type: 'arrive', road: '' },
  ],
  source: 'OSRM · OpenStreetMap',
  quality: 'estimated',
} as const;
const snapshot = OfflineRoutesSnapshot.parse({
  version: 1,
  savedAt: '2026-11-14T14:41:00.000Z',
  note: 'test',
  scenario: {
    origin: { name: 'A', coordinate: [21.2072, 45.7511] },
    destination: { name: 'B', coordinate: [21.2253, 45.7528] },
  },
  driving: [{ origin: [21.2072, 45.7511], destination: [21.2253, 45.7528], routes: [route] }],
  walking: [
    {
      origin: [21.2253, 45.7528],
      destination: [21.2257, 45.7537],
      route: { ...route, geometry: [[21.2253, 45.7528], [21.2255, 45.7532], [21.2257, 45.7537]] },
    },
  ],
});

it('serves a saved DEMO route only when the provider fails and both endpoints match', async () => {
  vi.doMock('../config', () => ({ config: { orsApiKey: undefined } }));
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const { setOfflineSnapshot } = await import('./offlineRoutes');
  setOfflineSnapshot(snapshot);
  const { getRoutes } = await import('./routing');
  // 20 m away from the saved endpoints still matches; the copy says it is saved, and when.
  const saved = await getRoutes([21.20735, 45.75118], [21.2253, 45.7528]);
  expect(saved.offline?.savedAt).toBe(snapshot.savedAt);
  expect(saved.routes[0]!.source).toMatch(/copie salvată pe 14 noiembrie 2026/);
  expect(saved.routes[0]!.geometry).toEqual(route.geometry);
  // Any other pair is not guessed: the error stays an error.
  await expect(getRoutes([21.24, 45.76], [21.2253, 45.7528])).rejects.toThrow();
});

it('never uses the saved copy while the provider answers', async () => {
  vi.doMock('../config', () => ({ config: { orsApiKey: undefined } }));
  const live = {
    code: 'Ok',
    routes: [
      {
        distance: 1600,
        duration: 250,
        geometry: { type: 'LineString', coordinates: route.geometry },
        legs: [{ steps: [{ name: 'Live', maneuver: { location: route.geometry[0], type: 'depart' } }] }],
      },
    ],
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(live))));
  const { setOfflineSnapshot } = await import('./offlineRoutes');
  setOfflineSnapshot(snapshot);
  const { getRoutes } = await import('./routing');
  const result = await getRoutes([21.2072, 45.7511], [21.2253, 45.7528]);
  expect(result.offline).toBeUndefined();
  expect(result.routes[0]!.distance).toBe(1600);
});

it('falls back to the saved walk for the parking → destination leg', async () => {
  vi.doMock('../config', () => ({ config: { orsApiKey: undefined } }));
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const { setOfflineSnapshot } = await import('./offlineRoutes');
  setOfflineSnapshot(snapshot);
  const { activeDirections } = await import('./activeRouting');
  const walk = await activeDirections('walk', [21.2253, 45.7528], [21.2257, 45.7537]);
  expect(walk.route.source).toMatch(/copie salvată/);
  await expect(activeDirections('cycle', [21.2253, 45.7528], [21.2257, 45.7537])).rejects.toThrow();
});

it('the bundled DEMO snapshot is valid and starts at Timișoara Nord', () => {
  const file = fileURLToPath(new URL('../../../shared/src/data/demo-routes.json', import.meta.url));
  const data = OfflineRoutesSnapshot.parse(JSON.parse(readFileSync(file, 'utf8')));
  expect(data.scenario.origin.name).toBe('Timișoara Nord');
  expect(data.driving.length).toBeGreaterThan(0);
  expect(data.walking.length).toBeGreaterThan(0);
});
