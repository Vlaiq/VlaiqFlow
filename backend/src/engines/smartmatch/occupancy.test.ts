import { describe, expect, it } from 'vitest';
import { betaBinomialFree, expectedOccupancy, findableSpaces, pFree, slotOf } from './occupancy';
import { orthodoxEaster, publicHoliday } from './holidays';
import { streetCapacity } from './candidates';

// Timișoara is UTC+2 in winter, UTC+3 in summer.
const local = (iso: string) => new Date(iso); // ISO with explicit offset

describe('public holidays', () => {
  it('computes Orthodox Easter for known years', () => {
    expect(orthodoxEaster(2025)).toEqual([4, 20]);
    expect(orthodoxEaster(2026)).toEqual([4, 12]);
    expect(orthodoxEaster(2027)).toEqual([5, 2]);
  });

  it('knows fixed and movable holidays', () => {
    expect(publicHoliday(2026, 12, 1)).toBe('Ziua Națională');
    expect(publicHoliday(2026, 4, 10)).toBe('Vinerea Mare');
    expect(publicHoliday(2026, 4, 13)).toBe('Paștele');
    expect(publicHoliday(2026, 5, 31)).toBe('Rusaliile');
    expect(publicHoliday(2026, 11, 13)).toBeNull();
  });

  it('treats a weekday holiday as Sunday, in local time', () => {
    // Tuesday 1 Dec 2026 (Ziua Națională) vs the ordinary Wednesday after it.
    expect(slotOf(local('2026-12-01T10:00:00+02:00')).day).toBe('sunday');
    expect(slotOf(local('2026-12-02T10:00:00+02:00')).day).toBe('weekday');
    expect(slotOf(local('2026-11-14T10:00:00+02:00')).day).toBe('saturday');
  });
});

describe('expected occupancy', () => {
  it('interpolates between hours instead of jumping', () => {
    // Centre on a weekday: 0.78 for 9–10, 0.90 for 10–11.
    const a = expectedOccupancy('centre', local('2026-11-13T09:55:00+02:00'));
    const b = expectedOccupancy('centre', local('2026-11-13T10:05:00+02:00'));
    expect(Math.abs(a - b)).toBeLessThan(0.03);
    expect(expectedOccupancy('centre', local('2026-11-13T09:30:00+02:00'))).toBeCloseTo(0.78);
    expect(expectedOccupancy('centre', local('2026-11-13T10:30:00+02:00'))).toBeCloseTo(0.9);
    expect(expectedOccupancy('centre', local('2026-11-13T10:00:00+02:00'))).toBeCloseTo(0.84);
  });
});

describe('beta-binomial availability', () => {
  it('matches the closed form P(full) = Π (α+i)/(α+β+i) for one space', () => {
    let full = 1;
    for (let i = 0; i < 20; i++) full *= (0.9 * 8 + i) / (8 + i);
    expect(betaBinomialFree(0.9, 20, 8, 1)).toBeCloseTo(1 - full, 10);
  });

  it('falls as the area gets busier and rises with capacity', () => {
    expect(betaBinomialFree(0.95, 30, 8)).toBeLessThan(betaBinomialFree(0.7, 30, 8));
    expect(betaBinomialFree(0.9, 5, 8)).toBeLessThan(betaBinomialFree(0.9, 50, 8));
  });

  it('asks a big lot for a few findable spaces, not just one', () => {
    expect(findableSpaces(10)).toBe(1);
    expect(findableSpaces(500)).toBe(15);
    // So a 500-space mall can be practically full on a Saturday afternoon.
    expect(pFree('commercial', local('2026-11-14T16:00:00+02:00'), 500).value).toBeLessThan(0.9);
  });

  it('returns a sensitivity range around the value', () => {
    const r = pFree('centre', local('2026-11-13T19:00:00+02:00'), 40);
    expect(r.range![0]).toBeLessThanOrEqual(r.value);
    expect(r.range![1]).toBeGreaterThanOrEqual(r.value);
    expect(r.factors.some((f) => f.startsWith('interval '))).toBe(true);
  });

  it('names the arrival time and how it was obtained', () => {
    const r = pFree('centre', local('2026-11-13T10:12:00+02:00'), 40, { arrivalNote: 'acum + 12 min de condus' });
    expect(r.factors[1]).toMatch(/sosire 10:12 \(acum \+ 12 min de condus\)/);
  });
});

describe('kerbside capacity', () => {
  it('counts one side at 6 m per space, at most 300 m', () => {
    // ~111 m north-south (0.001° latitude).
    const short = streetCapacity([[21.22, 45.75], [21.22, 45.751]]);
    expect(short.value).toBe(18);
    expect(short.quality).toBe('estimated');
    const long = streetCapacity([[21.22, 45.75], [21.22, 45.76]]); // ~1.1 km
    expect(long.value).toBe(50);
    expect(streetCapacity([[21.22, 45.75], [21.22, 45.75001]]).value).toBeNull();
  });
});
