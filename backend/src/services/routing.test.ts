import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
const fixture = {
  code: 'Ok',
  routes: [
    {
      distance: 150,
      duration: 25,
      geometry: {
        type: 'LineString',
        coordinates: [
          [21.21, 45.75],
          [21.211, 45.75],
          [21.211, 45.751],
        ],
      },
      legs: [
        {
          steps: [
            { name: '', maneuver: { location: [21.21, 45.75], type: 'depart' } },
            {
              name: 'Test only',
              maneuver: { location: [21.211, 45.75], type: 'turn', modifier: 'left' },
            },
            { name: '', maneuver: { location: [21.211, 45.751], type: 'arrive' } },
          ],
        },
      ],
    },
  ],
};
it('maps OSRM maneuvers and deduplicates requests without exposing keys', async () => {
  vi.doMock('../config', () => ({ config: { orsApiKey: undefined } }));
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture)));
  vi.stubGlobal('fetch', fetcher);
  const { getRoutes } = await import('./routing');
  const [a, b] = await Promise.all([
    getRoutes([21.21, 45.75], [21.211, 45.751]),
    getRoutes([21.21, 45.75], [21.211, 45.751]),
  ]);
  expect(a).toEqual(b);
  expect(a.routes[0]?.steps[1]?.index).toBe(1);
  expect(a.routes[0]?.quality).toBe('estimated');
  await getRoutes([21.21, 45.75], [21.211, 45.751]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toMatch(/^https:\/\/router.project-osrm.org\/route/);
});
it('uses ORS on the server and preserves provider maneuver indices', async () => {
  vi.doMock('../config', () => ({ config: { orsApiKey: 'test-only-key' } }));
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        features: [
          {
            geometry: fixture.routes[0]!.geometry,
            properties: {
              summary: { distance: 150, duration: 25 },
              segments: [
                {
                  steps: [
                    { type: 11, name: '-', way_points: [0, 1] },
                    { type: 0, name: 'Test', way_points: [1, 2] },
                    { type: 10, name: '-', way_points: [2, 2] },
                  ],
                },
              ],
            },
          },
        ],
      }),
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  const { getRoutes } = await import('./routing');
  const response = await getRoutes([21.21, 45.75], [21.211, 45.751]);
  expect(response.routes[0]?.steps[1]).toEqual({
    index: 1,
    type: 'turn',
    modifier: 'left',
    road: 'Test',
  });
  expect(JSON.stringify(response)).not.toContain('test-only-key');
  expect(fetcher.mock.calls[0]?.[1].headers.Authorization).toBe('test-only-key');
});
it('rejects failed and invalid upstream responses rather than manufacturing a route', async () => {
  vi.doMock('../config', () => ({ config: { orsApiKey: undefined } }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
  const { getRoutes } = await import('./routing');
  await expect(getRoutes([21.21, 45.75], [21.211, 45.751])).rejects.toThrow('unavailable');
});

const orsBody = () =>
  new Response(
    JSON.stringify({
      features: [
        {
          geometry: fixture.routes[0]!.geometry,
          properties: {
            summary: { distance: 150, duration: 25 },
            segments: [{ steps: [{ type: 11, name: '-', way_points: [0, 2] }, { type: 10, name: '-', way_points: [2, 2] }] }],
          },
        },
      ],
    }),
  );
// A school zone (§6.16) away from both ends of the test route.
const zone = { center: [21.3, 45.8] as [number, number], radiusM: 250 };

it('sends school zones to ORS as avoid_polygons and reports them applied', async () => {
  vi.doMock('../config', () => ({ config: { orsApiKey: 'test-only-key' } }));
  const fetcher = vi.fn().mockResolvedValue(orsBody());
  vi.stubGlobal('fetch', fetcher);
  const { getRoutes } = await import('./routing');
  const response = await getRoutes([21.21, 45.75], [21.211, 45.751], [zone]);
  expect(response.avoidance).toBe('applied');
  const body = JSON.parse(fetcher.mock.calls[0]?.[1].body);
  expect(body.options.avoid_polygons.type).toBe('MultiPolygon');
  expect(body.options.avoid_polygons.coordinates).toHaveLength(1);
});
it('routes normally and says so when ORS cannot keep out of the zone', async () => {
  vi.doMock('../config', () => ({ config: { orsApiKey: 'test-only-key' } }));
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 404 }))
    .mockResolvedValueOnce(orsBody());
  vi.stubGlobal('fetch', fetcher);
  const { getRoutes } = await import('./routing');
  const response = await getRoutes([21.21, 45.75], [21.211, 45.751], [zone]);
  expect(response.avoidance).toBe('failed');
  expect(JSON.parse(fetcher.mock.calls[1]?.[1].body).options).toBeUndefined();
});
it('marks zones not supported on the keyless OSRM fallback', async () => {
  vi.doMock('../config', () => ({ config: { orsApiKey: undefined } }));
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(fixture))));
  const { getRoutes } = await import('./routing');
  expect((await getRoutes([21.21, 45.75], [21.211, 45.751], [zone])).avoidance).toBe('not_supported');
  expect((await getRoutes([21.21, 45.75], [21.211, 45.751])).avoidance).toBeUndefined();
});
