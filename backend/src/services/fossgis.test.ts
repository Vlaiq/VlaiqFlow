import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOSSGIS_POLICY, FOSSGIS_USER_AGENT, fossgisRoute, resetFossgisQueue } from './fossgis';

// SYNTHETIC TEST FIXTURE in the OSRM response shape; not a real route.
const geometry: [number, number][] = [
  [21.2257, 45.7537],
  [21.226, 45.758],
  [21.2273, 45.766],
];
const osrm = {
  code: 'Ok',
  routes: [
    {
      distance: 1500,
      duration: 1200,
      geometry: { type: 'LineString', coordinates: geometry },
      legs: [
        {
          steps: [
            { name: '', maneuver: { location: geometry[0], type: 'depart' } },
            { name: 'Test street', maneuver: { location: geometry[1], type: 'turn', modifier: 'right' } },
            { name: '', maneuver: { location: geometry[2], type: 'arrive' } },
          ],
        },
      ],
    },
  ],
};
const from = geometry[0]!,
  to = geometry[2]!;

beforeEach(() => {
  resetFossgisQueue();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('FOSSGIS keyless walking/cycling fallback', () => {
  it('uses the foot and bike profiles with a team User-Agent and keeps the provider geometry', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(osrm)));
    vi.stubGlobal('fetch', fetcher);
    const walk = fossgisRoute('walk', from, to);
    await vi.runAllTimersAsync();
    const route = await walk;
    expect(route.geometry).toEqual(geometry);
    expect(route.steps.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(route.source).toContain('routing.openstreetmap.de');
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('https://routing.openstreetmap.de/routed-foot/route/v1/driving/');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(FOSSGIS_USER_AGENT);
    const bike = fossgisRoute('cycle', from, to);
    await vi.runAllTimersAsync();
    await bike;
    expect((fetcher.mock.calls[1] as unknown as [string])[0]).toContain('/routed-bike/');
  });

  it('spaces requests at least the policy interval apart and fails fast when the queue is full', async () => {
    const times: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        times.push(Date.now());
        return new Response(JSON.stringify(osrm));
      }),
    );
    const jobs = Array.from({ length: 3 }, () => fossgisRoute('walk', from, to));
    await vi.runAllTimersAsync();
    await Promise.all(jobs);
    expect(times).toHaveLength(3);
    for (let i = 1; i < times.length; i++)
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(FOSSGIS_POLICY.minIntervalMs);

    resetFossgisQueue();
    const flood = Array.from({ length: FOSSGIS_POLICY.maxQueued + 3 }, () =>
      fossgisRoute('walk', from, to).then(
        () => 'ok',
        (e: Error) => e.message,
      ),
    );
    await vi.runAllTimersAsync();
    const results = await Promise.all(flood);
    expect(results.filter((r) => r === 'FOSSGIS_BUSY').length).toBeGreaterThan(0);
  });

  it('rejects a provider error instead of drawing anything', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 429 })));
    const job = fossgisRoute('cycle', from, to).catch((e: Error) => e.message);
    await vi.runAllTimersAsync();
    expect(await job).toBe('FOSSGIS HTTP 429');
  });
});
