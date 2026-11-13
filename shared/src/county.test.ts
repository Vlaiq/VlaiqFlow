import { describe, expect, it } from 'vitest';
import { isInTimisCounty, TIMIS_COUNTY, TIMIS_COUNTY_BOUNDS } from './county';

describe('real Timiș county scope', () => {
  it('preserves inspected source identity and attribution', () => {
    expect(TIMIS_COUNTY.properties.iso_3166_2).toBe('RO-TM');
    expect(TIMIS_COUNTY.properties.name_alt).toBe('Timiș');
    expect(TIMIS_COUNTY.properties.license).toBe('Public domain');
    expect(TIMIS_COUNTY.geometry.coordinates[0]!.length).toBeGreaterThan(100);
    expect(TIMIS_COUNTY.properties.sourceSha256).toHaveLength(64);
  });
  it.each([
    ['Timișoara', 21.2257, 45.7537],
    ['Lugoj', 21.9022, 45.6886],
    ['Sânnicolau Mare', 20.6339, 46.0713],
    ['Jimbolia', 20.7172, 45.7911],
  ])('includes known Timiș localities: %s', (_name, lng, lat) =>
    expect(isInTimisCounty([Number(lng), Number(lat)])).toBe(true),
  );
  it.each([
    ['Arad', 21.3196, 46.1866],
    ['Belgrade', 20.4489, 44.7866],
    ['Bucharest', 26.1025, 44.4268],
    ['Păuliș (Arad), inside county bounding rectangle', 21.5833, 46.1167],
  ])('excludes outside locations: %s', (_name, lng, lat) =>
    expect(isInTimisCounty([Number(lng), Number(lat)])).toBe(false),
  );
  it('validates ring closure and derived camera bounds', () => {
    const ring = TIMIS_COUNTY.geometry.coordinates[0]!;
    expect(ring[0]).toEqual(ring.at(-1));
    expect(TIMIS_COUNTY_BOUNDS).toEqual([
      [20.242826, 45.152702],
      [22.543617, 46.174134],
    ]);
    expect(isInTimisCounty([NaN, 45.75])).toBe(false);
  });
});
