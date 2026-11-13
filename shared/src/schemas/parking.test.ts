import { describe, expect, it } from 'vitest';
import { Parking } from './parking';
import { unknownValue } from './quality';

const base = {
  id: 'osm-way-1',
  name: 'Test',
  lat: 45.75,
  lng: 21.22,
  type: 'surface' as const,
  capacity: unknownValue<number>(),
  capacityDisabled: unknownValue<number>(),
  price: unknownValue<{ perHourRon: number }>(),
  availability: unknownValue<{ freeSpaces: number }>(),
  source: 'OpenStreetMap',
};

describe('Parking schema', () => {
  it('accepts a parking whose availability and price are unknown', () => {
    expect(Parking.safeParse(base).success).toBe(true);
  });

  it('rejects a quality label outside the four allowed values', () => {
    const bad = { ...base, availability: { value: { freeSpaces: 5 }, quality: 'live', source: 'x' } };
    expect(Parking.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid coordinates', () => {
    expect(Parking.safeParse({ ...base, lat: 123 }).success).toBe(false);
  });
});
