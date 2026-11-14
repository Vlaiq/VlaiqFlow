import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CompleteJourneyRequest,
  type CompleteJourneyRequest as Request,
  type JourneyOption,
} from '@vlaiq/shared';
import {
  origin,
  destination,
  parking,
  recommendations,
  route,
  activeJourney,
} from '../../../shared/test-fixtures/completeJourney';
import { calculateCompleteJourneys, COMPLETE_POLICY, shortlistParkings } from './completeJourneys';
import { rankCompleteJourneys } from '../engines/completeRanking';
import { validateEndpoints } from './activeRouting';
const req = (extra: Partial<Request> = {}) =>
  CompleteJourneyRequest.parse({ origin, destination, ...extra });
function deps(options = [parking()]) {
  return {
    recommend: vi.fn(async () => recommendations(options)),
    drive: vi.fn(async (from, to) => ({ routes: [route(from, to, 300, 800)] })),
    active: vi.fn(async (mode, from, to): Promise<JourneyOption> => ({
      id: mode,
      mode,
      route: route(from, to, mode === 'cycle' ? 420 : 180, mode === 'cycle' ? 1400 : 200),
      practical: true,
      note: 'SYNTHETIC TEST FIXTURE',
    })),
  };
}
afterEach(() => vi.restoreAllMocks());
describe('complete journey orchestration', () => {
  it('routes origin→parking→destination and sums provider seconds/meters exactly', async () => {
    const d = deps();
    const result = await calculateCompleteJourneys(req(), d);
    const j = result.journeys.find((j) => j.parking)!;
    expect(d.drive).toHaveBeenCalledWith(origin, parking().coordinate);
    expect(d.active).toHaveBeenCalledWith('walk', parking().coordinate, destination);
    expect(j.legs.map((l) => l.type)).toEqual(['drive', 'parking', 'walk']);
    expect(j.travelSeconds.value).toBe(480);
    expect(j.distance.value).toBe(1000);
    expect(j.elapsedSeconds.value).toBeNull();
    expect(j.legs[1]!.duration.value).toBeNull();
    expect(j.parking?.fee.minorUnits).toBeNull();
    // Live availability stays unknown; the rule-model chance is carried separately and labelled estimated.
    expect(j.parking?.availability).toMatchObject({ value: null, quality: 'unknown' });
    expect(j.parking?.match.freeChance).toMatchObject({ value: 0.5, quality: 'estimated' });
    expect(j.parking?.match).toMatchObject({ rank: 1, kind: 'osm' });
    expect(j.parking?.match.score).toEqual({ total: 10, walk: 3, risk: 1, price: 1, drive: 5 });
    // The conversion into minutes travels with the parking, from the SmartMatch response.
    expect(j.parking?.match.params).toEqual({ fullPenaltyMinutes: 12, minutesPerCurrency: 8 });
  });
  it('keeps the SmartMatch order (risk and price), not only the shortest drive', async () => {
    // "near" is 1 driving minute closer but very likely full; "sure" wins on SmartMatch cost + drive.
    const near = parking('near');
    near.drive = { ...near.drive!, minutes: 4 };
    near.pFree = { ...near.pFree, value: 0.1 };
    near.cost = { total: 15, walk: 3, risk: 10.8, price: 1.2 };
    const sure = parking('sure');
    sure.drive = { ...sure.drive!, minutes: 5 };
    sure.pFree = { ...sure.pFree, value: 0.9 };
    sure.cost = { total: 5.4, walk: 3, risk: 1.2, price: 1.2 };
    const d = deps([near, sure]);
    // Same provider route for both, so travel time alone cannot decide.
    const result = await calculateCompleteJourneys(req({ modes: ['car_park_walk'] }), d);
    expect(result.journeys.map((j) => j.parking!.id)).toEqual(['sure', 'near']);
    expect(result.journeys.map((j) => j.parking!.match.rank)).toEqual([1, 2]);
    expect(result.rankings.balanced.recommendedId).toBe(result.journeys[0]!.id);
  });
  it('never treats a missing driving time as zero when ranking parkings', () => {
    const a = parking('a'),
      b = parking('b');
    a.cost = { ...a.cost, total: 6 };
    b.cost = { ...b.cost, total: 5 };
    a.drive = { ...a.drive!, minutes: 1 };
    b.drive = { ...b.drive!, minutes: null };
    const list = shortlistParkings([a, b]);
    expect(list.map((c) => c.option.id)).toEqual(['b', 'a']);
    expect(list.every((c) => c.driveMinutes === null)).toBe(true);
  });
  it('preserves cycle/pedestrian profiles, unknown search and coherent references', async () => {
    const result = await calculateCompleteJourneys(req(), deps());
    expect(result.journeys.find((j) => j.category === 'cycle')!.legs[0]).toMatchObject({
      type: 'cycle',
      profile: 'cycling-regular',
    });
    expect(result.journeys.find((j) => j.category === 'walk')!.legs[0]).toMatchObject({
      profile: 'foot-walking',
    });
    for (const ranking of Object.values(result.rankings))
      expect(ranking.ids).toContain(ranking.recommendedId);
    expect(result.opportunity).not.toBeNull();
  });
  it('keeps valid modes when cycling fails; does not use a fallback formula as route', async () => {
    const d = deps();
    const fn = d.active.getMockImplementation()!;
    d.active.mockImplementation(async (mode, from, to) => {
      if (mode === 'cycle') throw new Error('403');
      return fn(mode, from, to);
    });
    const result = await calculateCompleteJourneys(req(), d);
    expect(result.journeys.map((j) => j.category)).toEqual(['car_park_walk', 'walk']);
    expect(result.unavailable[0]?.category).toBe('cycle');
    d.active.mockRejectedValue(new Error('No pedestrian route'));
    expect((await calculateCompleteJourneys(req(), d)).journeys).toEqual([]);
  });
  it('excludes restricted parking and respects actual walking limit', async () => {
    const restricted = parking();
    restricted.access = 'customers';
    const d = deps([restricted]);
    expect(
      (await calculateCompleteJourneys(req({ modes: ['car_park_walk'] }), d)).journeys,
    ).toEqual([]);
    expect(d.drive).not.toHaveBeenCalled();
    expect(
      (
        await calculateCompleteJourneys(
          req({ maxWalkMinutes: 2, modes: ['car_park_walk'] }),
          deps(),
        )
      ).journeys,
    ).toEqual([]);
  });
  it('does not relabel a wrong active profile or accept a route to another place', async () => {
    const d = deps();
    d.active.mockResolvedValue({
      id: 'wrong',
      mode: 'drive',
      route: route(origin, destination),
      practical: true,
      note: 'wrong',
    });
    expect((await calculateCompleteJourneys(req(), d)).journeys).toEqual([]);
    expect(() =>
      validateEndpoints(
        [
          [21, 45],
          [21, 45],
        ],
        origin,
        destination,
      ),
    ).toThrow('ENDPOINT');
  });
  it('caps parking routes and isolates an invalid candidate', async () => {
    const d = deps(Array.from({ length: 10 }, (_, i) => parking(`p${i}`)));
    await calculateCompleteJourneys(req({ modes: ['car_park_walk'] }), d);
    expect(d.drive).toHaveBeenCalledTimes(COMPLETE_POLICY.parkingCandidates);
    expect(d.active).toHaveBeenCalledTimes(COMPLETE_POLICY.parkingCandidates);
    d.drive.mockResolvedValue({ routes: [{ ...route(origin, destination), duration: Infinity }] });
    expect(
      (await calculateCompleteJourneys(req({ modes: ['car_park_walk'] }), d)).journeys,
    ).toEqual([]);
  });
  it('converts fees to integer minor units without currency conversion and preserves free OSM', async () => {
    const p = parking();
    p.price = { ...p.price, total: 1.25, currency: 'EUR', quality: 'confirmed' };
    let r = await calculateCompleteJourneys(req({ modes: ['car_park_walk'] }), deps([p]));
    expect(r.journeys[0]?.parking?.fee).toMatchObject({ minorUnits: 125, currency: 'EUR' });
    p.price = { ...p.price, total: 0, currency: null, quality: 'estimated' };
    r = await calculateCompleteJourneys(req({ modes: ['car_park_walk'] }), deps([p]));
    expect(r.journeys[0]?.parking?.fee.minorUnits).toBe(0);
  });
  it('has stable candidate/journey ties regardless of completion order', async () => {
    const options = [parking('b'), parking('a')];
    const a = await calculateCompleteJourneys(req(), deps(options));
    const b = await calculateCompleteJourneys(req(), deps([...options].reverse()));
    expect(a.rankings).toEqual(b.rankings);
  });
});
describe('transparent preference ranking', () => {
  it('uses the five-minute threshold against a car journey and never treats unknown fees as free', async () => {
    const result = await calculateCompleteJourneys(req({ modes: ['car_park_walk'] }), deps());
    const car = result.journeys[0]!;
    const active = activeJourney('cycle', car.travelSeconds.value! + 300);
    expect(rankCompleteJourneys([car, active]).balanced.recommendedId).toBe(active.id);
    const slower = activeJourney('cycle', car.travelSeconds.value! + 301);
    expect(rankCompleteJourneys([car, slower]).balanced.recommendedId).toBe(car.id);
    expect(rankCompleteJourneys([car, slower]).green.recommendedId).toBe(slower.id);
    expect(car.parking?.fee.minorUnits).toBeNull();
  });
  it('fastest is shortest; balanced uses the 5 min rule; green excludes impractical routes', () => {
    const fast = activeJourney('cycle', 300),
      slower = activeJourney('walk', 570);
    const ranked = rankCompleteJourneys([slower, fast]);
    expect(ranked.fastest.recommendedId).toBe(fast.id);
    expect(ranked.balanced.recommendedId).toBe(fast.id);
    fast.practical = false;
    expect(rankCompleteJourneys([fast, slower]).green.recommendedId).toBe(slower.id);
    slower.practical = false;
    expect(rankCompleteJourneys([fast, slower]).green.recommendedId).toBe(fast.id);
  });
  it('uses deterministic IDs for ties and handles empty modes', () => {
    const a = activeJourney('walk', 300),
      b = activeJourney('cycle', 300);
    expect(rankCompleteJourneys([a, b])).toEqual(rankCompleteJourneys([b, a]));
    expect(rankCompleteJourneys([]).fastest.recommendedId).toBeNull();
  });
});
