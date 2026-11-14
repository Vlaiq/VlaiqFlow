import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// SYNTHETIC provider payloads: these tests do not establish live provider access.
const from: [number, number] = [21.22, 45.75];
const to: [number, number] = [21.221, 45.751];
const payload = () => ({
  features: [{
    geometry: { type: 'LineString', coordinates: [from, [21.22, 45.751], to] },
    properties: {
      summary: { distance: 160, duration: 120 },
      segments: [{ steps: [
        { type: 11, name: '-', way_points: [0, 1] },
        { type: 10, name: '-', way_points: [2, 2] },
      ] }],
    },
  }],
});
beforeEach(() => {
  vi.doMock('../config', () => ({ config: { orsApiKey: 'synthetic-auth-only' } }));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.useRealTimers();
});

it.each(['drive', 'walk', 'cycle'] as const)(
  'rejects geographically wrong %s geometry before it can enter a successful cache', async (mode) => {
    const invalid = payload();
    invalid.features[0]!.geometry.coordinates = [[22, 46], [22.005, 46.005], [22.01, 46.01]];
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(invalid)))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload())));
    vi.stubGlobal('fetch', fetcher);
    const { getRoutes } = await import('./routing');
    const { activeDirections } = await import('./activeRouting');
    const run = () => mode === 'drive' ? getRoutes(from, to) : activeDirections(mode, from, to);
    await expect(run()).rejects.toThrow('ROUTE_ENDPOINT_MISMATCH');
    await expect(run()).resolves.toBeTruthy();
    await run();
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);

it.each([
  ['out-of-range coordinate', (p: ReturnType<typeof payload>) => { p.features[0]!.geometry.coordinates[1] = [181, 45]; }],
  ['empty geometry', (p: ReturnType<typeof payload>) => { p.features[0]!.geometry.coordinates = []; }],
  ['unsupported geometry', (p: ReturnType<typeof payload>) => { p.features[0]!.geometry.type = 'Polygon'; }],
  ['negative metric', (p: ReturnType<typeof payload>) => { p.features[0]!.properties.summary.duration = -1; }],
  ['nonfinite metric', (p: ReturnType<typeof payload>) => { p.features[0]!.properties.summary.distance = Infinity; }],
  ['invalid maneuver index', (p: ReturnType<typeof payload>) => { p.features[0]!.properties.segments[0]!.steps[1]!.way_points = [99]; }],
] as const)('rejects %s for driving and active profiles', async (_name, invalidate) => {
  const invalid = payload();
  invalidate(invalid);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(invalid))));
  const { getRoutes } = await import('./routing');
  const { requestActiveRoute } = await import('./journeys');
  await expect(getRoutes(from, to)).rejects.toThrow();
  await expect(requestActiveRoute('walk', from, to)).rejects.toThrow();
  await expect(requestActiveRoute('cycle', from, to)).rejects.toThrow();
});

it('keeps active profile caches separate, coalesces requests and expires successful entries', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(payload())));
  vi.stubGlobal('fetch', fetcher);
  const { activeDirections } = await import('./activeRouting');
  await Promise.all([activeDirections('walk', from, to), activeDirections('walk', from, to)]);
  await activeDirections('cycle', from, to);
  await activeDirections('walk', from, to);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    'https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson',
    'https://api.heigit.org/openrouteservice/v2/directions/cycling-regular/geojson',
  ]);
  for (const [, init] of fetcher.mock.calls) {
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'synthetic-auth-only', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ coordinates: [from, to], instructions: true });
  }
  vi.advanceTimersByTime(300001);
  await activeDirections('walk', from, to);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it.each([401, 403, 429])('diagnoses HTTP %i without exposing payloads or attempting keyless fallback', async (status) => {
  const fetcher = vi.fn(async () => new Response('PRIVATE_UPSTREAM_TEXT', { status }));
  vi.stubGlobal('fetch', fetcher);
  const { getRoutes } = await import('./routing');
  const { compareJourneys } = await import('./journeys');
  await expect(getRoutes(from, to)).rejects.toMatchObject({ status });
  const result = await compareJourneys(from, to);
  expect(result.options).toEqual([]);
  expect(result.unavailable).toHaveLength(3);
  expect(fetcher).toHaveBeenCalledTimes(4);
  const diagnostics = JSON.stringify(vi.mocked(console.warn).mock.calls);
  expect(diagnostics).toContain(status === 429 ? 'rate_limited' : 'authentication_failure');
  expect(diagnostics).toContain(`\"status\":${status}`);
  expect(diagnostics).not.toContain('PRIVATE_UPSTREAM_TEXT');
  expect(diagnostics).not.toContain('synthetic-auth-only');
  expect(diagnostics).not.toContain(String(from[0]));
  // A partial comparison gets a short backoff, rather than multiplying failed requests.
  await compareJourneys(from, to);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it('honors every upstream deadline, releases failed in-flight jobs and retains matrix fallbacks/backoff', async () => {
  const deadlines = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() =>
    AbortSignal.abort(new DOMException('synthetic timeout', 'TimeoutError')),
  );
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    init.signal!.throwIfAborted();
    throw new Error('must not reach network');
  });
  vi.stubGlobal('fetch', fetcher);
  const { getRoutes } = await import('./routing');
  const { requestActiveRoute } = await import('./journeys');
  const { driveTimes } = await import('./driving');
  const { walkTimes } = await import('./walking');
  for (let i = 0; i < 2; i++) await expect(getRoutes(from, to)).rejects.toMatchObject({ name: 'TimeoutError' });
  await expect(requestActiveRoute('walk', from, to)).rejects.toMatchObject({ name: 'TimeoutError' });
  await expect(requestActiveRoute('cycle', from, to)).rejects.toMatchObject({ name: 'TimeoutError' });
  expect((await driveTimes(from, [to]))[0]).toMatchObject({ minutes: null, quality: 'unknown' });
  expect((await walkTimes(to, [from]))[0]?.source).toContain('linie dreaptă');
  await driveTimes(from, [to]);
  await walkTimes(to, [from]);
  expect(fetcher).toHaveBeenCalledTimes(6);
  expect(deadlines.mock.calls.map(([ms]) => ms)).toEqual([15000, 15000, 15000, 15000, 8000, 10000]);
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).toContain('timeout');
});

it('never logs arbitrary network exception text when the walking matrix degrades', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('PRIVATE_HEADER_AND_LOCATION')));
  const { walkTimes } = await import('./walking');
  await walkTimes(to, [from]);
  const diagnostic = JSON.stringify(vi.mocked(console.warn).mock.calls);
  expect(diagnostic).toContain('network_or_provider_failure');
  expect(diagnostic).not.toContain('PRIVATE_HEADER_AND_LOCATION');
});

it.each([401, 429])('keeps both matrix fallbacks and backoff on HTTP %i', async (status) => {
  const fetcher = vi.fn(async () => new Response('PRIVATE_PROVIDER_BODY', { status }));
  vi.stubGlobal('fetch', fetcher);
  const { driveTimes } = await import('./driving');
  const { walkTimes } = await import('./walking');
  expect((await driveTimes(from, [to]))[0]).toMatchObject({ minutes: null, quality: 'unknown' });
  expect((await walkTimes(to, [from]))[0]?.source).toContain('linie dreaptă');
  await driveTimes(from, [to]);
  await walkTimes(to, [from]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const diagnostic = JSON.stringify(vi.mocked(console.warn).mock.calls);
  expect(diagnostic).toContain(status === 401 ? 'authentication_failure' : 'rate_limited');
  expect(diagnostic).not.toContain('PRIVATE_PROVIDER_BODY');
});

it('rejects malformed JSON and reports invalid payload without logging the response text', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('PRIVATE_INVALID_JSON')));
  const { getRoutes } = await import('./routing');
  await expect(getRoutes(from, to)).rejects.toBeInstanceOf(SyntaxError);
  const diagnostic = JSON.stringify(vi.mocked(console.warn).mock.calls);
  expect(diagnostic).toContain('invalid_payload');
  expect(diagnostic).not.toContain('PRIVATE_INVALID_JSON');
});
