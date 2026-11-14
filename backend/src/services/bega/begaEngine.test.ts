import { afterEach, describe, expect, it, vi } from 'vitest';
import { BegaDataset, BegaResponse, type BegaMode, type BegaRequest, type BegaRoute } from '../../../../shared/src/schemas/bega';
import type { Coordinate } from '../../../../shared/src/schemas/navigation';
import { adaptActiveDirections, type BegaRouteProvider } from './begaAdapter';
import { createBegaEngine } from './begaEngine';
import { lineLengthMeters } from './begaGeometry';

// Entirely synthetic provider/OSM fixture: these numbers are NOT live Timișoara evidence.
const west: Coordinate = [21.205, 45.75];
const east: Coordinate = [21.215, 45.75];
const req: BegaRequest = { origin: [21.205, 45.751], destination: [21.215, 45.751], mode: 'walk' };
const timestamp = '2026-11-14T16:30:00.000Z';
const source = 'SYNTHETIC mock provider; not a live routing result';
function dataset(): BegaDataset {
  return BegaDataset.parse({
    type: 'FeatureCollection',
    metadata: {
      snapshotVersion: 'synthetic-tests-only', extractedAt: timestamp, osmBaseTimestamp: timestamp,
      source: 'SYNTHETIC geometry fixture', license: 'ODbL-1.0', attribution: 'Synthetic fixture; not OSM evidence',
      bbox: [21, 45.6, 21.5, 45.9], limitations: ['No real geographic evidence'],
      status: 'available', querySha256: '0'.repeat(64),
    },
    features: [{
      type: 'Feature', geometry: { type: 'LineString', coordinates: [west, east] },
      properties: {
        osmId: 'way/1', osmVersion: 1, osmTimestamp: timestamp,
        tags: { highway: 'path', foot: 'yes', bicycle: 'yes' }, nodeIds: [1, 2],
        modes: ['walk', 'cycle'], infrastructure: 'shared_use_path', source: 'Synthetic test fixture',
      },
    }],
  });
}
function route(mode: BegaMode, geometry: Coordinate[], durationSeconds?: number): BegaRoute {
  const distanceMeters = lineLengthMeters(geometry);
  return { mode, geometry: structuredClone(geometry), distanceMeters, durationSeconds: durationSeconds ?? distanceMeters / (mode === 'walk' ? 1.4 : 4.2), source, quality: 'estimated' };
}
function baseline(mode: BegaMode = 'walk'): BegaRoute { return route(mode, [req.origin, req.destination]); }
function setup(provider?: BegaRouteProvider, data: unknown = dataset(), policy: Parameters<typeof createBegaEngine>[0]['policy'] = {}) {
  const call = vi.fn(provider ?? (async (mode: BegaMode, from: Coordinate, to: Coordinate) => route(mode, [from, to])));
  return { call, engine: createBegaEngine({ routeProvider: call, corridorData: data, policy, now: () => Date.parse(timestamp) }) };
}
function available(result: BegaResponse) {
  expect(result.status).toBe('available');
  if (result.status !== 'available') throw new Error(JSON.stringify(result));
  return result;
}
afterEach(() => vi.useRealTimers());

describe('Bega orchestration with explicitly synthetic provider geometry', () => {
  it('returns a connected qualifying alternative with exact sums and signed deltas', async () => {
    const { engine, call } = setup();
    const result = available(await engine.calculateBegaAlternative(req));
    const a = result.alternative;
    expect(BegaResponse.safeParse(result).success).toBe(true);
    expect(call).toHaveBeenCalledTimes(4);
    expect(a.segments).toHaveLength(3);
    expect(a.geometry.coordinates).toEqual(a.segments.map((s) => s.geometry));
    expect(a.joinGapsMeters).toEqual([0, 0]);
    expect(a.distanceMeters).toBe(a.segments.reduce((n, s) => n + s.distanceMeters, 0));
    expect(a.durationSeconds).toBe(a.segments.reduce((n, s) => n + s.durationSeconds, 0));
    expect(a.deltaDistanceMeters).toBe(a.distanceMeters - result.baseline.distanceMeters);
    expect(a.deltaTimeSeconds).toBe(a.durationSeconds - result.baseline.durationSeconds);
    expect(a.deltaTimeSeconds).toBeGreaterThan(0);
    expect(a.corridorMeters).toBeCloseTo(lineLengthMeters([west, east]), 5);
    expect(a.corridorShare).toBe(a.corridorMeters / a.distanceMeters);
    expect(a.timeRatio).toBe(a.durationSeconds / result.baseline.durationSeconds);
    expect(result.explanation).toContain('adaugă');
  });
  it('reuses supplied validated baseline without re-requesting it', async () => {
    const { engine, call } = setup();
    const result = available(await engine.calculateBegaAlternative(req, { baseline: baseline() }));
    expect(call).toHaveBeenCalledTimes(3);
    expect(result.baseline).toEqual(baseline());
  });
  it('reports a negative time delta as faster, never as added time', async () => {
    const { engine } = setup();
    const slow = baseline(); slow.durationSeconds *= 2;
    const result = available(await engine.calculateBegaAlternative(req, { baseline: slow }));
    expect(result.alternative.deltaTimeSeconds).toBeLessThan(0);
    expect(result.explanation).toContain('mai puțin');
  });
  it('preserves all source, snapshot and original OSM node references', async () => {
    const { engine } = setup();
    const result = available(await engine.calculateBegaAlternative(req));
    expect(result.baseline.source).toBe(source);
    expect(result.alternative.source).toBe(source);
    expect(result.alternative.entry.nodeId).toBe(1);
    expect(result.alternative.exit.nodeId).toBe(2);
    expect(result.alternative.entry.osmIds).toEqual(['way/1']);
    expect(result.alternative.overlap.features.flatMap((f) => f.properties.osmIds)).toContain('way/1');
    expect(result.integrity.corridorSnapshotDate).toBe(timestamp);
    expect(result.integrity.mappingQuality).toBe('osm_contributed');
    expect(result.integrity.measurementQuality).toBe('derived_geometric_approximation');
  });
  it('returns only meaningful metrics without an environmental score or fabricated pollutants', async () => {
    const result = available(await setup().engine.calculateBegaAlternative(req));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/PM2\.5|NO₂|42%|pollutionReduction|environmentalScore|cleanerAir/);
    expect(result.integrity.limitations.join(' ')).toContain('Nu certifică siguranța');
  });
  it('uses the requested cycling profile for all segments', async () => {
    const { engine, call } = setup();
    const result = available(await engine.calculateBegaAlternative({ ...req, mode: 'cycle' }));
    expect(call.mock.calls.every(([mode]) => mode === 'cycle')).toBe(true);
    expect(result.alternative.segments.every((s) => s.mode === 'cycle')).toBe(true);
  });
  it('rejects invalid client inputs before any provider request', async () => {
    const { engine, call } = setup();
    await expect(engine.calculateBegaAlternative({ ...req, mode: 'drive' })).rejects.toThrow();
    await expect(engine.calculateBegaAlternative({ ...req, origin: [45.75, 21.205] })).rejects.toThrow();
    await expect(engine.calculateBegaAlternative({ ...req, origin: [NaN, 45.75] })).rejects.toThrow();
    await expect(engine.calculateBegaAlternative({ ...req, arbitraryBatch: [req] })).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
  it.each([null, {}, { type: 'FeatureCollection', features: [] }])('degrades without invalid or absent dataset %j', async (data) => {
    const { engine, call } = setup(undefined, data);
    expect((await engine.calculateBegaAlternative(req)).status).toBe('data_unavailable');
    expect(call).not.toHaveBeenCalled();
  });
  it('does not call providers for empty or blocked snapshots', async () => {
    for (const status of ['available', 'blocked'] as const) {
      const data = dataset(); data.features = []; data.metadata.status = status;
      const { engine, call } = setup(undefined, data);
      const result = await engine.calculateBegaAlternative(req);
      expect(result.status).toBe('data_unavailable');
      expect(result.baseline).toBeNull();
      expect(call).not.toHaveBeenCalled();
    }
  });
  it('screens very short and out-of-corridor trips without routing', async () => {
    const { engine, call } = setup();
    expect((await engine.calculateBegaAlternative({ ...req, destination: [21.2051, 45.751] })).reason).toBe('journey_too_short');
    expect((await engine.calculateBegaAlternative({ ...req, origin: [21.4, 45.85], destination: [21.42, 45.85] })).reason).toBe('outside_corridor_access_range');
    expect(call).not.toHaveBeenCalled();
  });
  it.each([
    ['wrong active mode', () => ({ ...baseline(), mode: 'cycle' })],
    ['drive mode', () => ({ ...baseline(), mode: 'drive' })],
    ['missing provenance', () => ({ ...baseline(), source: '' })],
    ['invalid coordinates', () => ({ ...baseline(), geometry: [[NaN, 45.75], req.destination] })],
    ['reversed coordinates', () => ({ ...baseline(), geometry: [[45.75, 21.205], req.destination] })],
    ['zero duration', () => ({ ...baseline(), durationSeconds: 0 })],
    ['zero distance', () => ({ ...baseline(), distanceMeters: 0 })],
    ['fictional metrics', () => ({ ...baseline(), distanceMeters: 10 })],
    ['simulation quality', () => ({ ...baseline(), quality: 'simulated' })],
    ['endpoint mismatch', () => route('walk', [[21.207, 45.751], req.destination])],
  ])('rejects supplied baseline with %s', async (_name, make) => {
    const { engine, call } = setup();
    expect((await engine.calculateBegaAlternative(req, { baseline: make() })).status).toBe('provider_unavailable');
    expect(call).not.toHaveBeenCalled();
  });
  it('rejects an invalid provider baseline rather than constructing geometry', async () => {
    const { engine, call } = setup(async () => ({ ...baseline(), geometry: [] }));
    const result = await engine.calculateBegaAlternative(req);
    expect(result.status).toBe('provider_unavailable');
    expect(result.alternative).toBeNull();
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('turns provider rejection into sanitized unavailable information', async () => {
    const { engine } = setup(async () => { throw new Error('secret authorization token must never be echoed'); });
    const result = await engine.calculateBegaAlternative(req);
    expect(result.status).toBe('provider_unavailable');
    expect(JSON.stringify(result)).not.toContain('secret authorization');
  });
  it('rejects an over-snapped corridor anchor', async () => {
    const { engine } = setup(async (mode, from, to) => {
      const geometry: Coordinate[] = [from, to];
      if (to[1] === west[1] && from[1] !== west[1]) geometry[1] = [to[0], to[1] + 0.00015];
      return route(mode, geometry);
    });
    const result = await engine.calculateBegaAlternative(req, { baseline: baseline() });
    expect(result.status).toBe('provider_unavailable');
    expect(result.alternative).toBeNull();
  });
  it('rejects sub-snap but disconnected provider segments without inserting a line', async () => {
    const { engine } = setup(async (mode, from, to) => {
      const geometry: Coordinate[] = [from, to];
      if (from[1] === west[1] && to[1] === west[1]) geometry[0] = [from[0] + 0.00002, from[1]];
      return route(mode, geometry);
    });
    const result = await engine.calculateBegaAlternative(req, { baseline: baseline() });
    expect(result.status).toBe('no_valid_alternative');
    expect(result.alternative).toBeNull();
  });
  it('rejects a routed corridor leg that goes around the promenade', async () => {
    const { engine } = setup(async (mode, from, to) => {
      const geometry: Coordinate[] = from[1] === west[1] && to[1] === west[1]
        ? [from, [from[0], from[1] + 0.0001], [to[0], to[1] + 0.0001], to] : [from, to];
      return route(mode, geometry);
    });
    expect((await engine.calculateBegaAlternative(req, { baseline: baseline() })).status).toBe('no_valid_alternative');
  });
  it('rejects a route on the other bank despite endpoint proximity', async () => {
    const { engine } = setup(async (mode, from, to) => {
      const geometry: Coordinate[] = from[1] === west[1] && to[1] === west[1]
        ? [from, [from[0], from[1] - 0.0002], [to[0], to[1] - 0.0002], to] : [from, to];
      return route(mode, geometry);
    });
    expect((await engine.calculateBegaAlternative(req, { baseline: baseline() })).status).toBe('no_valid_alternative');
  });
  it('does not count bridge-only infrastructure as a corridor', async () => {
    const data = dataset(); data.features[0]!.properties.tags.bridge = 'yes';
    const { engine, call } = setup(undefined, data);
    expect((await engine.calculateBegaAlternative(req, { baseline: baseline() })).status).toBe('not_relevant');
    expect(call).not.toHaveBeenCalled();
  });
  it('does not permit cycling on a pedestrian-only path', async () => {
    const data = dataset(); data.features[0]!.properties.tags.bicycle = 'no';
    const { engine, call } = setup(undefined, data);
    expect((await engine.calculateBegaAlternative({ ...req, mode: 'cycle' }, { baseline: baseline('cycle') })).status).toBe('not_relevant');
    expect(call).not.toHaveBeenCalled();
  });
  it('rejects excessive travel-time ratio or additional seconds', async () => {
    for (const request of [{ ...req, maxTimeRatio: 1 }, { ...req, maxExtraTimeSeconds: 0 }]) {
      expect((await setup().engine.calculateBegaAlternative(request, { baseline: baseline() })).status).toBe('no_valid_alternative');
    }
  });
  it('rejects excessive distance ratio with an otherwise acceptable time', async () => {
    const { engine } = setup(undefined, dataset(), { maxDistanceRatio: 1.1 });
    expect((await engine.calculateBegaAlternative(req, { baseline: baseline() })).status).toBe('not_relevant');
  });
  it('does not advertise a nearly identical baseline that already follows the corridor', async () => {
    const current = route('walk', [req.origin, west, east, req.destination]);
    expect((await setup().engine.calculateBegaAlternative(req, { baseline: current })).status).toBe('no_valid_alternative');
  });
  it('does not double count overlapping OSM features', async () => {
    const data = dataset();
    const duplicate = structuredClone(data.features[0]!); duplicate.properties.osmId = 'way/2';
    data.features.push(duplicate);
    const result = available(await setup(undefined, data).engine.calculateBegaAlternative(req));
    expect(result.alternative.corridorMeters).toBeCloseTo(lineLengthMeters([west, east]), 5);
    expect(result.alternative.overlap.features[0]!.properties.osmIds).toEqual(['way/1', 'way/2']);
  });
  it('breaks equal qualifying candidate metrics by stable node references', async () => {
    const data = dataset();
    // Distinct, individually connected graph components with identical geometry produce a true tie.
    const duplicate = structuredClone(data.features[0]!);
    duplicate.properties.osmId = 'way/2'; duplicate.properties.nodeIds = [3, 4];
    data.features.push(duplicate);
    const one = available(await setup(undefined, data).engine.calculateBegaAlternative(req));
    data.features.reverse();
    const two = available(await setup(undefined, data).engine.calculateBegaAlternative(req));
    expect(one.alternative.entry.nodeId).toBe(1);
    expect(one.alternative.exit.nodeId).toBe(2);
    expect(two.alternative).toEqual(one.alternative);
  });
  it('ranks two qualifying candidates by actual travel time before overlap', async () => {
    const data = dataset();
    data.features[0]!.geometry.coordinates = [west, [21.21, 45.75], east];
    data.features[0]!.properties.nodeIds = [1, 3, 2];
    const branch = structuredClone(data.features[0]!);
    branch.properties.osmId = 'way/2'; branch.properties.nodeIds = [3, 4];
    branch.geometry.coordinates = [[21.21, 45.75], [21.21, 45.75001]];
    data.features.push(branch);
    const { engine } = setup(async (mode, from, to) => {
      const r = route(mode, [from, to]);
      if (from[0] === west[0] && from[1] === west[1] && to[0] === 21.21) r.durationSeconds += 20;
      return r;
    }, data);
    const result = available(await engine.calculateBegaAlternative(req));
    expect(result.alternative.entry.nodeId).toBe(3);
    expect(result.alternative.exit.nodeId).toBe(2);
  });
  it('produces stable ranking and candidate references under repeated calculations', async () => {
    const data = dataset();
    const result1 = available(await setup(undefined, data).engine.calculateBegaAlternative(req));
    const result2 = available(await setup(undefined, data).engine.calculateBegaAlternative(req));
    expect(result1).toEqual(result2);
  });
});

describe('bounded cache, deduplication and reliability', () => {
  it('caches identical routes but isolates walking and cycling', async () => {
    const { engine, call } = setup();
    available(await engine.calculateBegaAlternative(req));
    available(await engine.calculateBegaAlternative(req));
    expect(call).toHaveBeenCalledTimes(4);
    available(await engine.calculateBegaAlternative({ ...req, mode: 'cycle' }));
    expect(call).toHaveBeenCalledTimes(8);
  });
  it('coalesces concurrent identical requests and keeps provider concurrency at one', async () => {
    let active = 0, maximum = 0;
    const { engine, call } = setup(async (mode, from, to) => {
      active++; maximum = Math.max(maximum, active);
      await Promise.resolve(); active--;
      return route(mode, [from, to]);
    });
    const results = await Promise.all([engine.calculateBegaAlternative(req), engine.calculateBegaAlternative(req)]);
    results.forEach(available);
    expect(call).toHaveBeenCalledTimes(4);
    expect(maximum).toBe(1);
  });
  it('evicts expired entries and never uses changed mode as a cache hit', async () => {
    let clock = Date.parse(timestamp);
    const call = vi.fn(async (mode: BegaMode, from: Coordinate, to: Coordinate) => route(mode, [from, to]));
    const engine = createBegaEngine({ routeProvider: call, corridorData: dataset(), now: () => clock, policy: { cacheTtlMs: 100 } });
    available(await engine.calculateBegaAlternative(req));
    clock += 101;
    available(await engine.calculateBegaAlternative(req));
    expect(call).toHaveBeenCalledTimes(8);
  });
  it('bounds stored cache entries and supports explicit clearing', async () => {
    const { engine, call } = setup(undefined, dataset(), { cacheEntries: 1 });
    available(await engine.calculateBegaAlternative(req));
    available(await engine.calculateBegaAlternative(req));
    expect(call).toHaveBeenCalledTimes(8);
    engine.clearCache();
    available(await engine.calculateBegaAlternative(req));
    expect(call).toHaveBeenCalledTimes(12);
  });
  it('physically removes cached location data after expiry and clears retention timers', async () => {
    vi.useFakeTimers();
    const { engine, call } = setup(undefined, dataset(), { cacheTtlMs: 100 });
    available(await engine.calculateBegaAlternative(req));
    expect(vi.getTimerCount()).toBe(4);
    engine.clearCache();
    expect(vi.getTimerCount()).toBe(0);
    available(await engine.calculateBegaAlternative(req));
    expect(call).toHaveBeenCalledTimes(8);
    expect(vi.getTimerCount()).toBe(4);
    await vi.advanceTimersByTimeAsync(101);
    expect(vi.getTimerCount()).toBe(0);
    // The injected clock stays fixed: the new provider calls prove physical eviction, not a stale-hit check.
    available(await engine.calculateBegaAlternative(req));
    expect(call).toHaveBeenCalledTimes(12);
    engine.clearCache();
  });
  it('does not leak mutable cached provider objects into callers', async () => {
    const { engine, call } = setup();
    const first = available(await engine.calculateBegaAlternative(req));
    first.baseline.geometry[0]![0] = 21.4;
    first.alternative.segments[0]!.source = 'tampered';
    const next = available(await engine.calculateBegaAlternative(req));
    expect(next.baseline.geometry[0]).toEqual(req.origin);
    expect(next.alternative.segments[0]!.source).toBe(source);
    expect(call).toHaveBeenCalledTimes(4);
  });
  it('stays within seven calls for at most two candidate alternatives', async () => {
    const data = dataset();
    data.features[0]!.geometry.coordinates.splice(1, 0, [21.21, 45.75]);
    data.features[0]!.properties.nodeIds.splice(1, 0, 3);
    const branch = structuredClone(data.features[0]!);
    branch.properties.osmId = 'way/2'; branch.properties.nodeIds = [3, 4];
    branch.geometry.coordinates = [[21.21, 45.75], [21.21, 45.75001]];
    data.features.push(branch);
    const { engine, call } = setup(undefined, data);
    const result = await engine.calculateBegaAlternative(req);
    expect(result.status).toBe('available');
    expect(call.mock.calls.length).toBeLessThanOrEqual(7);
  });
  it('times out providers and forwards an abort signal', async () => {
    vi.useFakeTimers();
    let suppliedSignal: AbortSignal | undefined;
    const { engine, call } = setup(async (_mode, _from, _to, signal) => {
      suppliedSignal = signal;
      return new Promise<BegaRoute>(() => {});
    }, dataset(), { providerTimeoutMs: 20 });
    const running = engine.calculateBegaAlternative(req);
    await vi.advanceTimersByTimeAsync(21);
    const result = await running;
    expect(result.status).toBe('provider_unavailable');
    expect(result.reason).toBe('timeout');
    expect(suppliedSignal?.aborted).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('holds provider concurrency when an adapter ignores abort', async () => {
    vi.useFakeTimers();
    const { engine, call } = setup(async () => new Promise<BegaRoute>(() => {}), dataset(), { providerTimeoutMs: 20 });
    const first = engine.calculateBegaAlternative(req);
    await vi.advanceTimersByTimeAsync(21);
    expect((await first).status).toBe('provider_unavailable');
    const next = engine.calculateBegaAlternative({ ...req, mode: 'cycle' });
    await vi.advanceTimersByTimeAsync(21);
    expect((await next).status).toBe('provider_unavailable');
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('rejects already cancelled calculations before any provider work', async () => {
    const controller = new AbortController(); controller.abort();
    const { engine, call } = setup();
    expect((await engine.calculateBegaAlternative(req, { signal: controller.signal })).reason).toBe('cancelled');
    expect(call).not.toHaveBeenCalled();
  });
  it('caller cancellation stops waiting without cancelling another coalesced caller', async () => {
    vi.useFakeTimers();
    let resolveBaseline: ((value: BegaRoute) => void) | undefined;
    const { engine, call } = setup(async (mode, from, to) => {
      if (from[1] === req.origin[1] && to[1] === req.destination[1])
        return new Promise<BegaRoute>((resolve) => { resolveBaseline = resolve; });
      return route(mode, [from, to]);
    });
    const controller = new AbortController();
    const first = engine.calculateBegaAlternative(req, { signal: controller.signal });
    const second = engine.calculateBegaAlternative(req);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect((await first).reason).toBe('cancelled');
    resolveBaseline!(baseline());
    available(await second);
    expect(call).toHaveBeenCalledTimes(4);
  });
  it('does not invoke a provider for a cancelled queued route after the slot frees', async () => {
    vi.useFakeTimers();
    let resolveBaseline: ((value: BegaRoute) => void) | undefined;
    const { engine, call } = setup(async (mode, from, to) => {
      if (mode === 'walk' && from[1] === req.origin[1] && to[1] === req.destination[1])
        return new Promise<BegaRoute>((resolve) => { resolveBaseline = resolve; });
      return route(mode, [from, to]);
    });
    const first = engine.calculateBegaAlternative(req);
    const controller = new AbortController();
    const queued = engine.calculateBegaAlternative({ ...req, mode: 'cycle' }, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect((await queued).reason).toBe('cancelled');
    resolveBaseline!(baseline());
    available(await first);
    expect(call).toHaveBeenCalledTimes(4);
    expect(call.mock.calls.every(([mode]) => mode === 'walk')).toBe(true);
  });
  it('keeps an immediate same-key replacement coalesced when the cancelled job settles', async () => {
    vi.useFakeTimers();
    let resolveFirst: ((value: BegaRoute) => void) | undefined;
    let invocation = 0;
    const { engine, call } = setup(async (mode, from, to) => {
      if (invocation++ === 0) return new Promise<BegaRoute>((resolve) => { resolveFirst = resolve; });
      return route(mode, [from, to]);
    });
    const controller = new AbortController();
    const first = engine.calculateBegaAlternative(req, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    const replacement = engine.calculateBegaAlternative(req);
    expect((await first).reason).toBe('cancelled');
    const coalesced = engine.calculateBegaAlternative(req);
    resolveFirst!(baseline());
    (await Promise.all([replacement, coalesced])).forEach(available);
    expect(call).toHaveBeenCalledTimes(5);
    engine.clearCache();
  });
  it('removes repeatedly cancelled queue entries while an abort-ignoring provider holds the slot', async () => {
    vi.useFakeTimers();
    let resolveStuck: ((value: BegaRoute) => void) | undefined;
    let invocation = 0;
    const { engine, call } = setup(async (mode, from, to) => {
      if (invocation++ === 0) return new Promise<BegaRoute>((resolve) => { resolveStuck = resolve; });
      return route(mode, [from, to]);
    });
    const initialController = new AbortController();
    const stuck = engine.calculateBegaAlternative(req, { signal: initialController.signal });
    await vi.advanceTimersByTimeAsync(0);
    initialController.abort();
    expect((await stuck).reason).toBe('cancelled');
    for (let i = 1; i <= 12; i++) {
      const controller = new AbortController();
      const distinct = { ...req, origin: [req.origin[0] + i * 0.00001, req.origin[1]] };
      const queued = engine.calculateBegaAlternative(distinct, { signal: controller.signal });
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
      expect((await queued).reason).toBe('cancelled');
      expect(vi.getTimerCount()).toBe(0);
    }
    expect(call).toHaveBeenCalledTimes(1);
    resolveStuck!(baseline());
    await vi.advanceTimersByTimeAsync(0);
    available(await engine.calculateBegaAlternative(req));
    expect(call).toHaveBeenCalledTimes(5);
    engine.clearCache();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects a fifth simultaneous analysis without another provider call', async () => {
    vi.useFakeTimers();
    const { engine, call } = setup(async () => new Promise<BegaRoute>(() => {}), dataset(), { providerTimeoutMs: 20 });
    const running = Array.from({ length: 4 }, () => engine.calculateBegaAlternative(req));
    const busy = await engine.calculateBegaAlternative(req);
    expect(busy.reason).toBe('analysis_busy');
    await vi.advanceTimersByTimeAsync(21);
    await Promise.all(running);
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('existing activeDirections adapter contract', () => {
  it('maps the existing JourneyOption while preserving profile geometry and source', async () => {
    const b = baseline();
    const active = vi.fn(async () => ({ id: 'mock', mode: 'walk' as const, practical: true, note: 'Synthetic', route: {
      id: 'mock', geometry: b.geometry, distance: b.distanceMeters, duration: b.durationSeconds, source,
      quality: 'estimated' as const, steps: [{ index: 0, type: 'depart', road: '' }],
    } }));
    const adapter = adaptActiveDirections(active);
    const result = await adapter('walk', req.origin, req.destination, new AbortController().signal);
    expect(result).toEqual(b);
    expect(active).toHaveBeenCalledWith('walk', req.origin, req.destination);
  });
  it('rejects the existing provider returning the wrong active mode', async () => {
    const b = baseline();
    const adapter = adaptActiveDirections(async () => ({ id: 'mock', mode: 'cycle', practical: true, note: 'Synthetic', route: {
      id: 'mock', geometry: b.geometry, distance: b.distanceMeters, duration: b.durationSeconds, source,
      quality: 'estimated', steps: [{ index: 0, type: 'depart', road: '' }],
    } }));
    await expect(adapter('walk', req.origin, req.destination, new AbortController().signal)).rejects.toThrow('WRONG_ROUTING_MODE');
  });
  it('does not call activeDirections for an already aborted request', async () => {
    const active = vi.fn();
    const controller = new AbortController(); controller.abort();
    await expect(adaptActiveDirections(active)('walk', req.origin, req.destination, controller.signal)).rejects.toThrow();
    expect(active).not.toHaveBeenCalled();
  });
});
