import { describe, expect, it } from 'vitest';
import { ParkingsResponse, TimparkSnapshot } from '@vlaiq/shared';
import { coverageSummary, exportCitySummary, type CityData } from './useCityData';

const unknown = { value: null, quality: 'unknown', source: 'none' };
const parking = {
  id: 'osm-way-1',
  name: 'Fixture only',
  lat: 45.75,
  lng: 21.22,
  type: 'surface',
  access: 'public',
  operator: null,
  capacity: { value: 20, quality: 'estimated', source: 'OSM capacity tag' },
  capacityDisabled: unknown,
  price: unknown,
  availability: unknown,
  source: 'OpenStreetMap way/1',
};
function fixture(): CityData {
  return {
    parkings: ParkingsResponse.parse({
      parkings: [parking, parking, { ...parking, id: 'osm-way-2', capacity: unknown }],
      dataset: {
        source: 'Fixture source',
        generatedAt: '2026-11-13T12:00:00Z',
        attribution: '© OpenStreetMap contributors',
      },
    }),
    timpark: TimparkSnapshot.parse({
      source: 'https://cont.primariatm.ro/api/mobile/parking',
      fetchedAt: '2026-11-13T12:00:00Z',
      data: {
        version: 'test',
        features: [
          {
            id: 'z1',
            kind: 'zone',
            name: 'Fixture zone',
            tariff: 'blue',
            checked: true,
            progressive: false,
            coordinates: [
              [21.22, 45.75],
              [21.23, 45.76],
            ],
          },
          {
            id: 'z1',
            kind: 'zone',
            name: 'Same ID repeated',
            tariff: 'blue',
            checked: true,
            progressive: false,
            coordinates: [
              [21.22, 45.75],
              [21.23, 45.76],
            ],
          },
        ],
        tariffs: {
          smsNumber: '0000',
          hourly: {
            green: { code: 'a', eur: 1 },
            red: { code: 'b', eur: 1 },
            yellow: { code: 'c', eur: 1 },
            blue: { code: 'd', eur: 1 },
          },
          progressive: [],
          day: { code: 'e', eur: 1, tariffs: [] },
          schedule: { weekdays: [8, 20] },
        },
      },
    }),
    destinations: null,
    health: null,
  };
}
describe('city coverage and privacy', () => {
  it('deduplicates within source and leaves cross-source identity separate', () => {
    const summary = coverageSummary(fixture());
    expect(summary.osmLocations).toBe(2);
    expect(summary.officialFeatures).toBe(1);
    expect(summary.officialAreas).toBe(1);
    expect(summary.knownCapacitySum).toBe(20);
    expect(summary).not.toHaveProperty('totalParkingLocations');
  });
  it('represents a missing dataset as unknown rather than empty coverage', () => {
    const summary = coverageSummary({
      parkings: null,
      timpark: null,
      destinations: null,
      health: null,
    });
    expect(summary.osmLocations).toBeNull();
    expect(summary.officialAreas).toBeNull();
  });
  it('exports only aggregate counts and provenance, without individual parking or movement coordinates', () => {
    const report = exportCitySummary(fixture());
    const json = JSON.stringify(report);
    expect(report.uniqueWithinSourceCounts.osmLocations).toBe(2);
    expect(report.sources).toHaveLength(2);
    expect(json).not.toContain('"lat"');
    expect(json).not.toContain('"lng"');
    expect(json).not.toContain('"coordinates"');
    expect(json).not.toContain('"transactions"');
    expect(report.deduplication).toContain('not summed');
  });
});
