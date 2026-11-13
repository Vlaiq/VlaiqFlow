import { describe, expect, it } from 'vitest';
import { nameParkings, UNNAMED_PARKING } from './parkingNames';
import { unknownValue } from './schemas/quality';
import type { Parking } from './schemas/parking';
import type { NeighbourhoodFeature } from './schemas/city';

const parking = (over: Partial<Parking>): Parking => ({
  id: 'p',
  name: UNNAMED_PARKING,
  nameIsDerived: true,
  neighbourhood: null,
  lat: 45.75,
  lng: 21.22,
  type: 'surface',
  access: 'public',
  operator: null,
  capacity: unknownValue(),
  capacityDisabled: unknownValue(),
  price: unknownValue(),
  availability: unknownValue(),
  source: 'OpenStreetMap',
  ...over,
});

const fabric: NeighbourhoodFeature = {
  type: 'Feature',
  properties: { id: 'f', slug: 'fabric', name: 'Fabric' },
  geometry: { type: 'Polygon', coordinates: [[[21.2, 45.74], [21.24, 45.74], [21.24, 45.76], [21.2, 45.76], [21.2, 45.74]]] },
};

describe('nameParkings', () => {
  const streets = [{ name: 'Strada Paris', points: [[21.2203, 45.7502]] as [number, number][] }];

  it('names an unnamed parking after the street it is next to, and flags it as derived', () => {
    const [p] = nameParkings([parking({})], { neighbourhoods: [fabric], osmStreets: streets });
    expect(p).toMatchObject({ name: 'Parcare lângă Strada Paris', nameIsDerived: true, neighbourhood: 'Fabric' });
  });

  it('falls back to the neighbourhood when no street is close', () => {
    const [p] = nameParkings([parking({ lng: 21.235 })], { neighbourhoods: [fabric], osmStreets: streets });
    expect(p?.name).toBe('Parcare în cartierul Fabric');
  });

  it('keeps real OSM names untouched', () => {
    const [p] = nameParkings([parking({ name: 'Kaufland', nameIsDerived: false })], { neighbourhoods: [fabric], osmStreets: streets });
    expect(p).toMatchObject({ name: 'Kaufland', nameIsDerived: false, neighbourhood: 'Fabric' });
  });

  it('uses the parking type in the name', () => {
    const [p] = nameParkings([parking({ type: 'underground' })], { neighbourhoods: [fabric], osmStreets: streets });
    expect(p?.name).toBe('Parcare subterană lângă Strada Paris');
  });
});
