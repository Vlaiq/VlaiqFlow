import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it('coalesces simultaneous pedestrian matrix requests and never fabricates route geometry', async () => {
  vi.doMock('../config', () => ({ config: { orsApiKey: 'test-key' } }));
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify({ durations: [[120]], distances: [[160]] })),
  );
  vi.stubGlobal('fetch', fetcher);
  const { walkTimes } = await import('./walking');
  const [a, b] = await Promise.all([
    walkTimes([21.22, 45.76], [[21.21, 45.75]]),
    walkTimes([21.22, 45.76], [[21.21, 45.75]]),
  ]);
  expect(a).toEqual(b);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(a[0]?.minutes).toBe(2);
  expect(a[0]).not.toHaveProperty('geometry');
});
it('rejects negative/nonfinite matrix values and labels the cached fallback honestly', async () => {
  vi.doMock('../config', () => ({ config: { orsApiKey: 'test-key' } }));
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify({ durations: [[-10]], distances: [[160]] })),
  );
  vi.stubGlobal('fetch', fetcher);
  const { walkTimes } = await import('./walking');
  const a = await walkTimes([21.22, 45.76], [[21.21, 45.75]]);
  await walkTimes([21.22, 45.76], [[21.21, 45.75]]);
  expect(a[0]?.source).toContain('linie dreaptă');
  expect(a[0]?.minutes).toBeGreaterThan(0);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
