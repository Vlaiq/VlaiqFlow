import { describe, expect, it, vi } from 'vitest';
import { BioPacerRequest, BioPacerResult, WalkingAccess } from '../../../../shared/src/schemas/transit';
import { assessDeparture, calculateBioPacer, type WalkingDependency } from './bioPacer';
import { TransitIndex } from './gtfsIndex';
import { departuresForStop } from './departures';
import { fixtureDigest, fixtureWalk } from './fixtures';

const index = new TransitIndex(fixtureDigest());
const request = () => BioPacerRequest.parse({ origin: [21.22, 45.75], stopId: 's1', startAt: '2026-11-16T10:00:00+02:00' });
const now = () => new Date('2026-11-16T08:00:00Z');
const selected = () => departuresForStop(index, { stopId: 's1', from: request().startAt }).departures[0]!;
const afterSeconds = (seconds: number) => ({ ...selected(), scheduledAt: new Date(Date.parse(request().startAt) + seconds * 1000).toISOString() });

describe('dimensionally correct, preference-aware feasibility', () => {
  it.each([
    [600, 'COMFORTABLE', 3], [450, 'BRISK', 3.6 * 400 / 330], [300, 'TOO_TIGHT', 8],
    [120, 'TOO_TIGHT', null], [100, 'TOO_TIGHT', null], [0, 'MISSED', null], [-60, 'MISSED', null],
  ])('%s seconds until scheduled departure => %s', (seconds, category, speed) => {
    const result = assessDeparture(request(), afterSeconds(seconds), fixtureWalk());
    expect(result.category).toBe(category);
    if (speed === null) expect(result.requiredSpeedKmh).toBeNull(); else expect(result.requiredSpeedKmh).toBeCloseTo(speed);
    expect(result.availableSeconds).toBe(seconds - 120);
  });
  it('honors slower personal pace, buffer and provider duration; does not shorten provider estimates', () => {
    expect(assessDeparture({ ...request(), comfortableSpeedKmh: 2 }, afterSeconds(600), fixtureWalk()).category).toBe('TOO_TIGHT');
    expect(assessDeparture({ ...request(), connectionBufferSeconds: 360 }, afterSeconds(600), fixtureWalk()).category).toBe('TOO_TIGHT');
    expect(assessDeparture(request(), afterSeconds(600), { ...fixtureWalk(), durationSeconds: 900 }).category).toBe('TOO_TIGHT');
    expect(assessDeparture({ ...request(), comfortableSpeedKmh: 8 }, afterSeconds(600), fixtureWalk()).estimatedWalkSeconds).toBe(360);
  });
  it('has no division by zero, accepts a zero-distance arrival, and keeps missing data null', () => {
    expect(assessDeparture(request(), afterSeconds(120), fixtureWalk()).requiredSpeedKmh).toBeNull();
    expect(assessDeparture(request(), afterSeconds(600), { ...fixtureWalk(), distanceMeters: 0, durationSeconds: 0 }).requiredSpeedKmh).toBe(0);
    expect(assessDeparture(request(), afterSeconds(600), null)).toMatchObject({ category: 'UNKNOWN', walking: null, requiredSpeedKmh: null, estimatedWalkSeconds: null });
  });
  it.each([NaN, Infinity, -1, 1e308])('rejects invalid/non-finite route distance %s', (distanceMeters) => expect(WalkingAccess.safeParse({ ...fixtureWalk(), distanceMeters }).success).toBe(false));
  it('rejects naive dates, missing origins and invalid preferences', () => {
    expect(BioPacerRequest.safeParse({ ...request(), startAt: '2026-11-16T10:00:00' }).success).toBe(false);
    expect(BioPacerRequest.safeParse({ ...request(), origin: undefined }).success).toBe(false);
    expect(BioPacerRequest.safeParse({ ...request(), comfortableSpeedKmh: 0 }).success).toBe(false);
  });
  it('preserves pace invariants over varied distances, buffers and available time', () => {
    for (let distance = 100; distance <= 1200; distance += 100) {
      for (let seconds = 300; seconds <= 1800; seconds += 300) {
        const walk = { ...fixtureWalk(), distanceMeters: distance, durationSeconds: distance };
        const early = assessDeparture(request(), afterSeconds(seconds), walk);
        const later = assessDeparture(request(), afterSeconds(seconds + 600), walk);
        const buffered = assessDeparture({ ...request(), connectionBufferSeconds: 240 }, afterSeconds(seconds), walk);
        expect(later.requiredSpeedKmh!).toBeLessThanOrEqual(early.requiredSpeedKmh!);
        expect(buffered.requiredSpeedKmh!).toBeGreaterThanOrEqual(early.requiredSpeedKmh!);
        if (early.category === 'COMFORTABLE') expect(later.category).toBe('COMFORTABLE');
      }
    }
  });
});

describe('bounded orchestration with injected existing walking architecture', () => {
  it('selects a later comfortable scheduled connection over the imminent tight one', async () => {
    const walk = vi.fn().mockResolvedValue(fixtureWalk());
    const result = await calculateBioPacer(request(), index, walk, { now });
    expect(result.options.map((o) => o.category)).toEqual(['TOO_TIGHT', 'COMFORTABLE']);
    expect(result).toMatchObject({ status: 'ok', reason: null, recommendation: 'NEXT_DEPARTURE_RECOMMENDED', recommendedDepartureId: '20261116:t2:1', quality: { schedule: 'simulated', walking: 'simulated', feasibility: 'simulated', liveService: 'unknown' } });
    expect(result.feed?.sha256).toBe('a'.repeat(64));
    expect(walk).toHaveBeenCalledTimes(1);
    expect(BioPacerResult.safeParse(result).success).toBe(true);
  });
  it('does not recommend an unsafe pace when no comfortable next departure exists', async () => {
    const result = await calculateBioPacer({ ...request(), departureLimit: 1 }, index, async () => fixtureWalk(), { now });
    expect(result.recommendedDepartureId).toBeNull(); expect(result.recommendation).toBe('NONE');
  });
  it('can recommend the first comfortable departure after a later start', async () => {
    const result = await calculateBioPacer({ ...request(), startAt: '2026-11-16T10:06:00+02:00' }, index, async () => fixtureWalk(), { now });
    expect(result.recommendation).toBe('COMFORTABLE'); expect(result.options).toHaveLength(1);
  });
  it.each([
    ['null', async () => null, 'WALKING_UNAVAILABLE'],
    ['rejection', async () => { throw new Error('provider private details must not leak'); }, 'WALKING_UNAVAILABLE'],
    ['wrong mode', async () => ({ ...fixtureWalk(), mode: 'drive' }), 'INVALID_WALKING_ROUTE'],
    ['wrong profile', async () => ({ ...fixtureWalk(), profile: 'driving-car' }), 'INVALID_WALKING_ROUTE'],
    ['wrong endpoint', async () => ({ ...fixtureWalk(), geometry: [[20, 44], [20, 44]] }), 'INVALID_WALKING_ROUTE'],
    ['wrong requested endpoint', async () => ({ ...fixtureWalk(), to: [22, 46] }), 'INVALID_WALKING_ROUTE'],
    ['implausible geometry distance', async () => ({ ...fixtureWalk(), geometry: [[21.22, 45.75], [22, 46], [21.221, 45.751]] }), 'INVALID_WALKING_ROUTE'],
    ['impossible distance', async () => ({ ...fixtureWalk(), distanceMeters: 1 }), 'INVALID_WALKING_ROUTE'],
    ['zero duration', async () => ({ ...fixtureWalk(), durationSeconds: 0 }), 'INVALID_WALKING_ROUTE'],
  ])('handles %s without a positive feasibility claim', async (_, walk, reason) => {
    const result = await calculateBioPacer(request(), index, walk as WalkingDependency, { now });
    expect(result.reason).toBe(reason); expect(result.status).toBe('unavailable');
    expect(result.options.every((o) => o.category === 'UNKNOWN')).toBe(true);
    expect(result.recommendedDepartureId).toBeNull(); expect(JSON.stringify(result)).not.toContain('private details');
  });
  it('enforces a provider deadline, aborts the signal and does not wait indefinitely', async () => {
    let signal: AbortSignal | undefined;
    const result = await calculateBioPacer(request(), index, (_from, _to, s) => { signal = s; return new Promise(() => {}); }, { now, walkingTimeoutMs: 5 });
    expect(result.reason).toBe('WALKING_TIMEOUT'); expect(signal?.aborted).toBe(true);
  });
  it('makes no provider calls for absent GTFS, missing origin, no nearby stop, invalid or unsupported dates', async () => {
    const walk = vi.fn();
    expect((await calculateBioPacer(request(), null, walk, { now })).reason).toBe('GTFS_UNAVAILABLE');
    expect((await calculateBioPacer({}, index, walk, { now })).reason).toBe('INVALID_INPUT');
    expect((await calculateBioPacer({ ...request(), stopId: 'entrance' }, index, walk, { now })).reason).toBe('NO_NEARBY_STOP');
    expect((await calculateBioPacer({ ...request(), startAt: '2025-01-01T00:00:00Z' }, index, walk, { now })).reason).toBe('INVALID_INPUT');
    expect((await calculateBioPacer({ ...request(), startAt: '2027-02-01T00:00:00Z' }, index, walk, { now })).reason).toBe('EXPIRED_FEED');
    expect(walk).not.toHaveBeenCalled();
  });
  it('bounds candidate/provider calls and retains a valid option when another platform fails', async () => {
    const walk = vi.fn(async (_from: unknown, to: number[]) => to[0] === 21.221 ? fixtureWalk() : null);
    const result = await calculateBioPacer({ ...request(), stopId: undefined, candidateLimit: 2 }, index, walk, { now });
    expect(walk).toHaveBeenCalledTimes(2); expect(result.status).toBe('ok'); expect(result.failures).toHaveLength(1);
    const limited = vi.fn(async () => fixtureWalk());
    await calculateBioPacer({ ...request(), stopId: undefined, candidateLimit: 1 }, index, limited, { now });
    expect(limited).toHaveBeenCalledTimes(1);
  });
  it('skips provider calls without valid scheduled service and never duplicates calls per departure', async () => {
    const walk = vi.fn(async () => fixtureWalk());
    await calculateBioPacer({ ...request(), routeId: 'absent' }, index, walk, { now });
    expect(walk).not.toHaveBeenCalled();
    await calculateBioPacer(request(), index, walk, { now });
    expect(walk).toHaveBeenCalledTimes(1);
  });
  it('reassesses at completion so a slow provider cannot recommend a departure that has passed', async () => {
    let calls = 0;
    const clock = () => new Date(calls++ === 0 ? '2026-11-16T08:00:00Z' : '2026-11-16T08:21:00Z');
    const result = await calculateBioPacer(request(), index, async () => fixtureWalk(), { now: clock });
    expect(result.options).toEqual([]); expect(result.recommendedDepartureId).toBeNull();
    expect(result.evaluatedStartAt).toBe('2026-11-16T08:21:00.000Z');
  });
  it('accepts short request delays while reporting the evaluated start time', async () => {
    const result = await calculateBioPacer({ ...request(), startAt: '2026-11-16T07:59:50Z' }, index, async () => fixtureWalk(), { now });
    expect(result.status).toBe('ok'); expect(result.requestedStartAt).toBe('2026-11-16T07:59:50Z');
    expect(result.evaluatedStartAt).toBe('2026-11-16T08:00:00.000Z');
  });
});
