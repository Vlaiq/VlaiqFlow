import { describe, expect, it } from 'vitest';
import type { Parking, RecommendationOption, TimparkSnapshot } from '@vlaiq/shared';
import { buildCandidates, type Candidate } from './candidates';
import { pFree } from './occupancy';
import { paidMinutes, timparkPrice } from './price';
import { explain, rank } from './rank';

// Timișoara is UTC+2 in November. 13 Nov 2026 = Friday, 14 = Saturday, 15 = Sunday.
const FRI_10 = new Date('2026-11-13T08:00:00Z');
const FRI_19 = new Date('2026-11-13T17:00:00Z');
const FRI_03 = new Date('2026-11-13T01:00:00Z');
const SAT_16 = new Date('2026-11-14T14:00:00Z');
const SUN_12 = new Date('2026-11-15T10:00:00Z');

// Same shape and values as the City Hall snapshot of 13 Nov 2026 (shared/src/data/timpark.json).
const tariffs: TimparkSnapshot['data']['tariffs'] = {
  smsNumber: '7406',
  hourly: {
    green: { code: '110', eur: 0.89 },
    red: { code: '111', eur: 0.6 },
    yellow: { code: '112', eur: 0.42 },
    blue: { code: '113', eur: 0.3 },
  },
  progressive: [
    { code: '121', eur: 0.89 },
    { code: '122', eur: 1.13 },
    { code: '123', eur: 1.31 },
    { code: '124', eur: 1.55 },
  ],
  day: { code: '114', eur: 3.57, tariffs: ['red', 'yellow', 'blue'] },
  schedule: { weekdays: [8, 20], saturday: { green: [8, 17] } },
};

describe('Timpark price over the stay', () => {
  it('bills started hours inside the paid window', () => {
    expect(timparkPrice('red', false, FRI_10, 120, tariffs, 's').total).toBeCloseTo(1.2);
    // 19:00–21:00: only 19–20 is paid.
    const evening = timparkPrice('red', false, FRI_19, 120, tariffs, 's');
    expect(evening.paidMinutes).toBe(60);
    expect(evening.total).toBeCloseTo(0.6);
  });

  it('is free outside the schedule (Sunday, Saturday for non-green)', () => {
    expect(timparkPrice('green', false, SUN_12, 120, tariffs, 's').total).toBe(0);
    expect(timparkPrice('red', false, SAT_16, 120, tariffs, 's').total).toBe(0);
    expect(paidMinutes('green', SAT_16, 120, tariffs.schedule)).toBe(60); // green is paid until 17:00 on Saturday
  });

  it('uses progressive steps and the day ticket when cheaper', () => {
    expect(timparkPrice('green', true, FRI_10, 180, tariffs, 's').total).toBeCloseTo(
      0.89 + 1.13 + 1.31,
    );
    const long = timparkPrice('red', false, FRI_10, 480, tariffs, 's'); // 8 × 0.60 = 4.80 > 3.57
    expect(long.total).toBeCloseTo(3.57);
    expect(long.note).toMatch(/Bilet de o zi/);
  });
});

describe('rule-based availability', () => {
  it('follows the time of day and is always an estimate in [0.05, 0.95]', () => {
    const night = pFree('residential', FRI_03, null).value;
    const day = pFree('residential', FRI_10, null).value;
    expect(day).toBeGreaterThan(night);
    for (const at of [FRI_03, FRI_10, FRI_19, SAT_16, SUN_12]) {
      const v = pFree('centre', at, null).value;
      expect(v).toBeGreaterThanOrEqual(0.05);
      expect(v).toBeLessThanOrEqual(0.95);
    }
  });

  it('gives a large parking better odds than a small one at the same occupancy', () => {
    expect(pFree('centre', FRI_10, 300).value).toBeGreaterThan(pFree('centre', FRI_10, 10).value);
  });

  it('peaks malls on Saturday afternoon', () => {
    expect(pFree('commercial', SAT_16, 500).value).toBeLessThan(
      pFree('commercial', FRI_10, 500).value,
    );
  });
});

function cand(id: string, over: Partial<Candidate> = {}): Candidate {
  return {
    id,
    kind: 'osm',
    name: id,
    nameIsDerived: false,
    coordinate: [21.22, 45.75],
    straightM: 100,
    access: 'public',
    tariff: null,
    smsCode: null,
    capacity: { value: null, quality: 'unknown', source: 'none' },
    profile: 'residential',
    price: {
      total: 0,
      currency: 'EUR',
      paidMinutes: 0,
      quality: 'confirmed',
      source: 's',
      note: '',
    },
    flags: [],
    ...over,
  };
}
const walk = (minutes: number): RecommendationOption['walk'] => ({
  minutes,
  meters: minutes * 80,
  quality: 'estimated',
  source: 'test',
});
const fixedP = (table: Record<string, number>) => (c: Candidate) => ({
  value: table[c.id]!,
  expectedOccupancy: 0,
  factors: [],
});

describe('SmartMatch ranking', () => {
  it('prefers a farther parking that is likely free over a close one that is likely full', () => {
    // The worked example: 3 + 0.7 × 12 = 11.4 loses to 7 + 0.1 × 12 = 8.2.
    const { options } = rank({
      candidates: [cand('close'), cand('far')],
      walks: [walk(3), walk(7)],
      at: FRI_10,
      mode: 'balanced',
      maxWalkMinutes: 12,
      pFreeOf: fixedP({ close: 0.3, far: 0.9 }),
    });
    expect(options.map((o) => o.id)).toEqual(['far', 'close']);
    expect(options[0]!.cost.total).toBeCloseTo(8.2);
    expect(options[1]!.cost.total).toBeCloseTo(11.4);
  });

  it('re-ranks to the next-best option when the winner becomes full', () => {
    const base = {
      candidates: [cand('A'), cand('B')],
      walks: [walk(4), walk(6)],
      at: FRI_10,
      mode: 'balanced' as const,
      maxWalkMinutes: 12,
    };
    expect(rank({ ...base, pFreeOf: fixedP({ A: 0.9, B: 0.9 }) }).options[0]!.id).toBe('A');
    expect(rank({ ...base, pFreeOf: fixedP({ A: 0.05, B: 0.9 }) }).options[0]!.id).toBe('B');
  });

  it('drops candidates beyond the walking limit', () => {
    const r = rank({
      candidates: [cand('near'), cand('far')],
      walks: [walk(5), walk(15)],
      at: FRI_10,
      mode: 'balanced',
      maxWalkMinutes: 12,
    });
    expect(r.options.map((o) => o.id)).toEqual(['near']);
    expect(r.considered).toBe(1);
  });

  it('never treats an unknown price as free', () => {
    const unknown = cand('unknown', {
      price: {
        total: null,
        currency: null,
        paidMinutes: null,
        quality: 'unknown',
        source: 'none',
        note: '',
      },
    });
    const paid = cand('paid', {
      price: {
        total: 1.2,
        currency: 'EUR',
        paidMinutes: 120,
        quality: 'confirmed',
        source: 's',
        note: '',
      },
    });
    const { options } = rank({
      candidates: [unknown, paid],
      walks: [walk(5), walk(5)],
      at: FRI_10,
      mode: 'cheap',
      maxWalkMinutes: 12,
      pFreeOf: fixedP({ unknown: 0.5, paid: 0.5 }),
    });
    const u = options.find((o) => o.id === 'unknown')!;
    expect(u.cost.price).toBe(options.find((o) => o.id === 'paid')!.cost.price);
    expect(u.flags.join(' ')).toMatch(/Preț necunoscut/);
    // With a floor, an unknown price is never cheaper than the floor even when every known price is 0.
    const floored = rank({
      candidates: [unknown, cand('free')],
      walks: [walk(5), walk(5)],
      at: FRI_10,
      mode: 'cheap',
      maxWalkMinutes: 12,
      unknownPriceFloor: 1.78,
      pFreeOf: fixedP({ unknown: 0.5, free: 0.5 }),
    });
    expect(floored.options[0]!.id).toBe('free');
    expect(floored.options[1]!.cost.price).toBeCloseTo(1.78 * 25);
    const withoutTariffFloor = rank({
      candidates: [unknown, cand('free')],
      walks: [walk(5), walk(5)],
      at: FRI_10,
      mode: 'cheap',
      maxWalkMinutes: 12,
      pFreeOf: fixedP({ unknown: 0.5, free: 0.5 }),
    });
    expect(withoutTariffFloor.options[0]!.id).toBe('free');
    expect(withoutTariffFloor.options.find((o) => o.id === 'unknown')!.price.total).toBeNull();
    expect(withoutTariffFloor.options.find((o) => o.id === 'unknown')!.cost.price).toBeGreaterThan(
      0,
    );
  });

  it('cheap mode picks the free option that balanced mode does not', () => {
    const free = cand('free');
    const paid = cand('paid', {
      price: {
        total: 0.6,
        currency: 'EUR',
        paidMinutes: 60,
        quality: 'confirmed',
        source: 's',
        note: '',
      },
    });
    const input = {
      candidates: [free, paid],
      walks: [walk(9), walk(2)],
      at: FRI_10,
      maxWalkMinutes: 12,
      pFreeOf: fixedP({ free: 0.8, paid: 0.8 }),
    };
    expect(rank({ ...input, mode: 'balanced' }).options[0]!.id).toBe('paid'); // 2 + 2.4 + 4.8 = 9.2 beats 9 + 2.4 = 11.4
    expect(rank({ ...input, mode: 'cheap' }).options[0]!.id).toBe('free');
  });

  it('explains the choice with the computed numbers', () => {
    const { options } = rank({
      candidates: [cand('A'), cand('B')],
      walks: [walk(3), walk(7)],
      at: FRI_10,
      mode: 'balanced',
      maxWalkMinutes: 12,
      pFreeOf: fixedP({ A: 0.9, B: 0.6 }),
    });
    const text = explain(options)!;
    expect(text).toContain('A e prima alegere: 3 min pe jos, ~90% șanse de loc, gratuit');
    expect(text).toContain('Rezerva, B');
  });
});

describe('candidates', () => {
  const lotRing: [number, number][] = [
    [21.22, 45.75],
    [21.221, 45.75],
    [21.221, 45.7506],
    [21.22, 45.7506],
    [21.22, 45.75],
  ];
  const timpark: TimparkSnapshot = {
    source: 'https://cont.primariatm.ro/api/mobile/parking',
    fetchedAt: '2026-11-13T00:00:00Z',
    data: {
      version: 'test',
      tariffs,
      features: [
        {
          id: 'lot1',
          kind: 'lot',
          name: 'Test',
          tariff: 'red',
          progressive: false,
          checked: true,
          coordinates: lotRing,
        },
      ],
    },
  };
  const osm = (id: string, lng: number, lat: number, access: Parking['access']): Parking => ({
    id,
    name: id,
    nameIsDerived: false,
    neighbourhood: null,
    lat,
    lng,
    type: 'surface',
    access,
    operator: null,
    capacity: { value: null, quality: 'unknown', source: 'none' },
    capacityDisabled: { value: null, quality: 'unknown', source: 'none' },
    price: { value: null, quality: 'unknown', source: 'none' },
    availability: { value: null, quality: 'unknown', source: 'none' },
    source: 'test',
  });

  it('does not merge a nearby but separate OSM parking solely by distance', () => {
    const smallLot: TimparkSnapshot = {
      ...timpark,
      data: {
        ...timpark.data,
        features: [
          {
            ...timpark.data.features[0]!,
            coordinates: [
              [21.22, 45.75],
              [21.2201, 45.75],
              [21.2201, 45.7501],
              [21.22, 45.7501],
              [21.22, 45.75],
            ],
          },
        ],
      },
    };
    const list = buildCandidates({
      destination: [21.22, 45.75],
      at: FRI_10,
      stayMinutes: 120,
      timpark: smallLot,
      places: [],
      streets: null,
      parkings: [osm('separate', 21.2202, 45.75005, 'public')],
    });
    expect(list.map((c) => c.id)).toContain('separate');
  });

  it('keeps the Timpark lot, drops its OSM duplicate and far customers-only parkings', () => {
    const list = buildCandidates({
      destination: [21.2205, 45.7503],
      at: FRI_10,
      stayMinutes: 120,
      timpark,
      places: [],
      streets: null,
      parkings: [
        osm('dup', 21.2205, 45.7503, 'public'), // inside the lot polygon
        osm('shop-far', 21.2265, 45.7503, 'customers'), // ~470 m
        osm('free', 21.224, 45.7503, 'unknown'), // ~270 m
      ],
    });
    expect(list.map((c) => c.id)).toEqual(['timpark-lot1', 'free']);
    const lot = list[0]!;
    expect(lot.price.total).toBeCloseTo(1.2);
    expect(lot.price.quality).toBe('confirmed');
    expect(lot.capacity.value).toBeGreaterThan(100); // ~78 m × 67 m ÷ 25 m²
    expect(lot.profile).toBe('centre'); // red tariff
    expect(list[1]!.price.quality).toBe('unknown');
  });
});
