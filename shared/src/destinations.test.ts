import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildDestinations,
  buildSearchIndex,
  normalize,
  normalizeStreetName,
  searchDestinations,
} from './destinations';
import { NeighbourhoodsSnapshot, PoisSnapshot, StreetsSnapshot, type RegisterStreet } from './schemas/city';
import { TimparkSnapshot, type TimparkFeature } from './schemas/timpark';

describe('normalize', () => {
  it('ignores diacritics (comma-below and cedilla forms) and case', () => {
    expect(normalize('Piața Unirii')).toBe('piata unirii');
    expect(normalize('PIAŢA UNIRII')).toBe('piata unirii'); // ţ with cedilla
    expect(normalize('Mărășești')).toBe('marasesti');
  });

  it('expands street-type abbreviations used in the Timpark data', () => {
    expect(normalizeStreetName('B-dul Dr.Iosif Bulbuca')).toBe('bulevardul dr iosif bulbuca');
    expect(normalizeStreetName('1 Decembrie 1918, Blvd.')).toBe('bulevardul 1 decembrie 1918');
    expect(normalizeStreetName('Str. Mărășești')).toBe('strada marasesti');
  });
});

const street = (over: Partial<RegisterStreet>): RegisterStreet => ({
  id: 1,
  name: 'Strada Test',
  current: 'Test',
  previous: null,
  type: 'Strada',
  neighbourhood: null,
  status: 'Existenta',
  ...over,
});

const tpStreet = (name: string, coords: [number, number][]): TimparkFeature => ({
  id: name,
  kind: 'street',
  name,
  tariff: 'red',
  progressive: false,
  checked: true,
  coordinates: coords,
});

describe('buildDestinations', () => {
  const dests = buildDestinations({
    streets: [
      street({ id: 1, name: 'Strada Mărășești', current: 'Mărășești' }),
      street({ id: 2, name: 'Piața Victoriei', current: 'Victoriei', type: 'Piața' }),
      street({ id: 3, name: 'Strada Fără Geometrie', current: 'Fără Geometrie', neighbourhood: 'Cetate I' }),
      street({ id: 4, name: 'Strada Veche', current: 'Veche', status: 'Dezafectata' }),
    ],
    pois: [{ id: 'lloyd', name: 'Palatul Lloyd', nameEn: 'Lloyd Palace', address: 'Piața Victoriei nr. 2', lat: 45.7537, lng: 21.2252 }],
    neighbourhoods: [
      {
        type: 'Feature',
        properties: { id: 'c', slug: 'cetate', name: 'Cetate' },
        geometry: { type: 'Polygon', coordinates: [[[21.2, 45.7], [21.3, 45.7], [21.3, 45.8], [21.2, 45.8]]] },
      },
    ],
    timparkStreets: [tpStreet('Str. Mărășești', [[21.22, 45.75], [21.24, 45.75]])],
  });
  const byId = (id: string) => dests.find((d) => d.id === id);

  it('places a register street on its Timpark geometry', () => {
    const d = byId('street-1');
    expect(d?.precision).toBe('street');
    expect(d?.location?.lng).toBeCloseTo(21.23, 6);
    expect(d?.location?.lat).toBeCloseTo(45.75, 6);
  });

  it('places a square on the landmark whose address names it', () => {
    expect(byId('street-2')).toMatchObject({ precision: 'street', location: { lat: 45.7537, lng: 21.2252 } });
  });

  it('falls back to the neighbourhood centre and says so', () => {
    const d = byId('street-3');
    expect(d?.precision).toBe('neighbourhood');
    expect(d?.locationSource).toContain('Cetate');
  });

  it('skips decommissioned streets', () => {
    expect(byId('street-4')).toBeUndefined();
  });

  it('finds destinations without diacritics, by English name too', () => {
    const index = buildSearchIndex(dests);
    expect(searchDestinations(index, 'marasesti')[0]?.id).toBe('street-1');
    expect(searchDestinations(index, 'piata vict')[0]?.id).toBe('street-2');
    expect(searchDestinations(index, 'lloyd palace')[0]?.id).toBe('poi-lloyd');
    expect(searchDestinations(index, '   ')).toEqual([]);
  });
});

describe('real City Hall snapshots', () => {
  const file = (n: string) => fileURLToPath(new URL(`./data/${n}`, import.meta.url));
  const files = ['streets.json', 'pois.json', 'neighbourhoods.json', 'timpark.json'];
  const available = files.every((f) => existsSync(file(f)));
  const load = <T>(schema: { parse: (x: unknown) => T }, n: string) => schema.parse(JSON.parse(readFileSync(file(n), 'utf8')));

  it.runIf(available)('every register street that exists is a destination, and the main squares are located', () => {
    const streets = load(StreetsSnapshot, 'streets.json').data.streets;
    const dests = buildDestinations({
      streets,
      pois: load(PoisSnapshot, 'pois.json').data.pois,
      neighbourhoods: load(NeighbourhoodsSnapshot, 'neighbourhoods.json').data.features,
      timparkStreets: load(TimparkSnapshot, 'timpark.json').data.features.filter((f) => f.kind === 'street'),
    });
    const streetDests = dests.filter((d) => d.kind === 'street');
    expect(streetDests.length).toBe(streets.filter((s) => s.status === 'Existenta').length);

    const index = buildSearchIndex(dests);
    for (const q of ['piata victoriei', 'piata unirii']) {
      const top = searchDestinations(index, q)[0];
      expect(top?.location, `${q} should be located`).not.toBeNull();
    }

    const counts = { street: 0, neighbourhood: 0, none: 0 };
    for (const d of streetDests) counts[d.precision as keyof typeof counts]++;
    console.log('register streets by location precision:', counts);
  });
});
