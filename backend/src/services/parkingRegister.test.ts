import { describe, expect, it } from 'vitest';
import { ParkingRegisterResponse } from '@vlaiq/shared';
import { parkingRegister } from './parkingRegister';
import { availabilityModel } from '../engines/smartmatch';
import { AvailabilityModelResponse } from '@vlaiq/shared';

describe('parking register', () => {
  const reg = parkingRegister();

  it('matches the shared schema and lists every snapshot parking once', () => {
    expect(ParkingRegisterResponse.safeParse(reg).success).toBe(true);
    const ids = reg.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(reg.rows.filter((r) => r.kind === 'osm').length).toBeGreaterThan(0);
  });

  it('never claims a confirmed capacity or an invented price', () => {
    for (const r of reg.rows) {
      expect(r.capacity.quality).not.toBe('confirmed');
      if (r.hourly.value == null) expect(r.hourly.quality).toBe('unknown');
      if (r.kind === 'osm') expect(r.hourly.quality).not.toBe('confirmed');
    }
  });

  it('links every OSM parking to its public OpenStreetMap page', () => {
    for (const r of reg.rows.filter((x) => x.kind === 'osm')) {
      expect(r.sourceUrl).toMatch(/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);
    }
  });
});

describe('published availability model', () => {
  it('matches the shared schema', () => {
    expect(AvailabilityModelResponse.safeParse(availabilityModel()).success).toBe(true);
    expect(availabilityModel().calibrated).toBe(false);
  });
});
