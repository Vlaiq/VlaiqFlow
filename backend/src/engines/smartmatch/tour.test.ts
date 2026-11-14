import { describe, expect, it } from 'vitest';
import { rankingWalk, tourCentre, tourFor, tourSpreadM } from './tour';
import type { WalkTime } from './rank';

const walk = (minutes: number, quality: WalkTime['quality'] = 'estimated'): WalkTime => ({
  minutes,
  meters: Math.round(minutes * 80),
  quality,
  source: 'test',
});

describe('Parchează o dată (one parking, several stops)', () => {
  it('adds every leg parking → destination → stops → parking, in order', () => {
    const tour = tourFor(
      { parking: 'P', places: ['Piața Victoriei', 'Farmacie'] },
      walk(4),
      [walk(6)],
      walk(3.25),
    );
    expect(tour.minutes).toBe(13.3);
    expect(tour.legs.map((l) => `${l.from}→${l.to}`)).toEqual([
      'P→Piața Victoriei',
      'Piața Victoriei→Farmacie',
      'Farmacie→P',
    ]);
    expect(tour.quality).toBe('estimated');
  });

  it('ranks by the walking that depends on the parking, and keeps each leg within the limit', () => {
    // Close to the destination but far from the last stop: 2 + 11 = 13 min.
    const nearFirst = rankingWalk(walk(2), walk(11), 12)!;
    // In between: 5 + 4 = 9 min, so a parking between the stops wins on walking.
    const between = rankingWalk(walk(5), walk(4), 12)!;
    expect(between.minutes).toBeLessThan(nearFirst.minutes);
    expect(rankingWalk(walk(2), walk(13), 12)).toBeNull();
  });

  it('is deterministic: same input, same tour', () => {
    const a = tourFor({ parking: 'P', places: ['A', 'B'] }, walk(3), [walk(2)], walk(4));
    const b = tourFor({ parking: 'P', places: ['A', 'B'] }, walk(3), [walk(2)], walk(4));
    expect(a).toEqual(b);
  });

  it('centres the candidate search between the places and measures their spread', () => {
    const [lng, lat] = tourCentre([[21.22, 45.75], [21.24, 45.76]]);
    expect(lng).toBeCloseTo(21.23, 9);
    expect(lat).toBeCloseTo(45.755, 9);
    expect(tourSpreadM([21.2253, 45.7528], [[21.2253, 45.7618]])).toBeGreaterThan(990);
    expect(tourSpreadM([21.2253, 45.7528], [])).toBe(0);
  });
});
