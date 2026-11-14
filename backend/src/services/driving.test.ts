import { afterEach, expect, it, vi } from 'vitest';
import { RecommendationRequest } from '@vlaiq/shared';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it('keeps driving time unknown without an explicit origin', async () => {
  vi.doMock('../config', () => ({ config: { orsApiKey: 'test-key' } }));
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const { driveTimes } = await import('./driving');
  const result = await driveTimes(undefined, [[21.22, 45.75]]);
  expect(result[0]?.minutes).toBeNull();
  expect(result[0]?.quality).toBe('unknown');
  expect(fetcher).not.toHaveBeenCalled();
});
it('keeps time unknown rather than inventing a straight-line driving estimate when no key exists', async () => {
  vi.doMock('../config', () => ({ config: { orsApiKey: undefined } }));
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const { driveTimes } = await import('./driving');
  expect((await driveTimes([21.21, 45.75], [[21.22, 45.75]]))[0]?.minutes).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
it('maps actual ORS metrics, sends the explicit origin, caches results and preserves unknown rows', async () => {
  vi.doMock('../config', () => ({ config: { orsApiKey: 'test-key' } }));
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ durations: [[120, null]], distances: [[900, null]] })),
    );
  vi.stubGlobal('fetch', fetcher);
  const { driveTimes } = await import('./driving');
  const from: [number, number] = [21.21, 45.75],
    to: Array<[number, number]> = [
      [21.22, 45.75],
      [21.23, 45.76],
    ];
  const [result, concurrent] = await Promise.all([driveTimes(from, to), driveTimes(from, to)]);
  expect(concurrent).toEqual(result);
  expect(result[0]).toMatchObject({ minutes: 2, meters: 900, quality: 'estimated' });
  expect(result[1]?.minutes).toBeNull();
  expect(JSON.parse(fetcher.mock.calls[0]?.[1].body).locations).toEqual([from, ...to]);
  await driveTimes(from, to);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('provider failures do not disable parking recommendations', async () => {
  vi.doMock('../config', () => ({ config: { orsApiKey: 'test-key' } }));
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const { driveTimes } = await import('./driving');
  expect((await driveTimes([21.21, 45.75], [[21.22, 45.75]]))[0]?.minutes).toBeNull();
});
it('schema accepts selected origins and the distinct less-walking parking preference', () => {
  const request = RecommendationRequest.parse({
    origin: [21.21, 45.75],
    destination: [21.22, 45.76],
    mode: 'less_walk',
  });
  expect(request.mode).toBe('less_walk');
  expect(request.origin).toEqual([21.21, 45.75]);
  expect(
    RecommendationRequest.safeParse({ origin: [21, 95], destination: [21.22, 45.76] }).success,
  ).toBe(false);
});
