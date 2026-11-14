import { afterEach, describe, expect, it, vi } from 'vitest';

const geometry: [number, number][] = [
  [21.22, 45.75],
  [21.221, 45.751],
];
const route = {
  id: 'fixture-drive',
  geometry,
  distance: 1500,
  duration: 600,
  source: 'TEST FIXTURE driving',
  quality: 'estimated',
  steps: [
    { index: 0, type: 'depart', road: '' },
    { index: 1, type: 'arrive', road: '' },
  ],
};
const origin: [number, number] = [21.22, 45.75],
  destination: [number, number] = [21.221, 45.751];
const activeResponse = (duration: number) => ({
  features: [
    {
      geometry: { type: 'LineString', coordinates: geometry },
      properties: {
        summary: { distance: 1200, duration },
        segments: [
          {
            steps: [
              { type: 11, name: '-', way_points: [0, 1] },
              { type: 10, name: 'Test destination', way_points: [1, 1] },
            ],
          },
        ],
      },
    },
  ],
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe('real-profile journey comparison', () => {
  it('uses the keyless FOSSGIS foot/bike routes without ORS and never calls ORS', async () => {
    vi.doMock('../config', () => ({ config: { orsApiKey: undefined } }));
    vi.doMock('./routing', () => ({ getRoutes: vi.fn().mockResolvedValue({ routes: [route] }) }));
    const fossgisRoute = vi.fn(async (mode: 'walk' | 'cycle') => ({
      ...route,
      id: `fossgis-${mode}-0`,
      duration: mode === 'walk' ? 900 : 500,
      source: `TEST FIXTURE fossgis ${mode}`,
    }));
    vi.doMock('./fossgis', () => ({ fossgisRoute }));
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { compareJourneys } = await import('./journeys');
    const result = await compareJourneys(origin, destination);
    expect(result.options.map((o) => o.mode)).toEqual(['drive', 'walk', 'cycle']);
    expect(result.unavailable).toEqual([]);
    expect(fossgisRoute).toHaveBeenCalledWith('walk', origin, destination);
    expect(fossgisRoute).toHaveBeenCalledWith('cycle', origin, destination);
    expect(result.options.find((o) => o.mode === 'walk')?.route.geometry).toEqual(geometry);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses distinct foot and bicycle profiles with backend-only authorization and preserves road geometry', async () => {
    vi.doMock('../config', () => ({ config: { orsApiKey: 'test-only-key' } }));
    vi.doMock('./routing', () => ({ getRoutes: vi.fn().mockResolvedValue({ routes: [route] }) }));
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(JSON.stringify(activeResponse(url.includes('foot-walking') ? 900 : 500))),
    );
    vi.stubGlobal('fetch', fetcher);
    const { compareJourneys } = await import('./journeys');
    const [a, b] = await Promise.all([
      compareJourneys(origin, destination),
      compareJourneys(origin, destination),
    ]);
    expect(a).toEqual(b);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map((args) => args[0])).toContain(
      'https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson',
    );
    expect(fetcher.mock.calls.map((args) => args[0])).toContain(
      'https://api.heigit.org/openrouteservice/v2/directions/cycling-regular/geojson',
    );
    expect(a.options.find((o) => o.mode === 'cycle')?.route.geometry).toEqual(geometry);
    expect(a.options.find((o) => o.mode === 'cycle')?.route.steps[1]?.index).toBe(1);
    expect(JSON.stringify(a)).not.toContain('test-only-key');
    expect(a.opportunity?.mode).toBe('walk');
    await compareJourneys(origin, destination);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('retains available driving when an active provider fails and rejects unsupported geometry', async () => {
    vi.doMock('../config', () => ({ config: { orsApiKey: 'test-only-key' } }));
    vi.doMock('./routing', () => ({ getRoutes: vi.fn().mockResolvedValue({ routes: [route] }) }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ features: [] }))),
    );
    const { compareJourneys } = await import('./journeys');
    const result = await compareJourneys(origin, destination);
    expect(result.options).toHaveLength(1);
    expect(result.options[0]?.mode).toBe('drive');
    expect(result.unavailable).toHaveLength(2);
  });
  it('returns honest empty states when no route is available', async () => {
    vi.doMock('../config', () => ({ config: { orsApiKey: undefined } }));
    vi.doMock('./routing', () => ({
      getRoutes: vi.fn().mockRejectedValue(new Error('upstream unavailable')),
    }));
    vi.doMock('./fossgis', () => ({
      fossgisRoute: vi.fn().mockRejectedValue(new Error('upstream unavailable')),
    }));
    const { compareJourneys } = await import('./journeys');
    const result = await compareJourneys(origin, destination);
    expect(result.options).toEqual([]);
    expect(result.unavailable).toHaveLength(3);
    expect(result.opportunity).toBeNull();
  });
});
