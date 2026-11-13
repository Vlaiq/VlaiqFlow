import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TimparkSnapshot, type TimparkFeature, type TimparkTariffs } from './schemas/timpark';
import { describeSchedule, featureQuality, hourlyPrice, isPaidAt, paidWindow } from './timpark';

// Values copied from the City Hall endpoint on 13 Nov 2026.
const tariffs: TimparkTariffs = {
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
  ],
  day: { code: '114', eur: 3.57, tariffs: ['red', 'yellow', 'blue'] },
  schedule: { weekdays: [8, 20], saturday: { green: [8, 17] } },
};

const street = (over: Partial<TimparkFeature> = {}): TimparkFeature => ({
  id: 's1',
  kind: 'street',
  name: 'Test',
  tariff: 'yellow',
  progressive: false,
  checked: true,
  coordinates: [
    [21.22, 45.75],
    [21.23, 45.75],
  ],
  ...over,
});

// Timișoara is UTC+2 in November (EET).
const friday10 = new Date('2026-11-13T08:00:00Z'); // Fri 10:00 local
const friday2030 = new Date('2026-11-13T18:30:00Z'); // Fri 20:30 local
const saturday10 = new Date('2026-11-14T08:00:00Z'); // Sat 10:00 local
const sunday10 = new Date('2026-11-15T08:00:00Z'); // Sun 10:00 local

describe('Timpark schedule', () => {
  it('is paid on a weekday inside 8–20 and free after 20:00', () => {
    expect(isPaidAt('blue', friday10, tariffs.schedule)).toBe(true);
    expect(isPaidAt('blue', friday2030, tariffs.schedule)).toBe(false);
  });

  it('on Saturday only the green tariff is paid', () => {
    expect(isPaidAt('green', saturday10, tariffs.schedule)).toBe(true);
    expect(isPaidAt('yellow', saturday10, tariffs.schedule)).toBe(false);
    expect(paidWindow('yellow', saturday10, tariffs.schedule)).toBeNull();
  });

  it('is free on Sunday', () => {
    expect(isPaidAt('green', sunday10, tariffs.schedule)).toBe(false);
  });

  it('describes the schedule in Romanian', () => {
    expect(describeSchedule(tariffs.schedule)).toBe('Luni–vineri 8–20; sâmbătă doar verde 8–17; duminică gratuit');
  });
});

describe('Timpark prices', () => {
  it('uses the hourly price and SMS code of the feature colour', () => {
    expect(hourlyPrice(street(), tariffs)).toEqual({ type: 'hourly', amount: 0.42, currency: 'EUR', smsCode: '112' });
  });

  it('lists the published steps for progressive features instead of guessing', () => {
    const p = hourlyPrice(street({ progressive: true }), tariffs);
    expect(p.type).toBe('progressive');
    if (p.type === 'progressive') expect(p.steps.map((s) => s.amount)).toEqual([0.89, 1.13]);
  });

  it('marks unchecked features as estimated', () => {
    expect(featureQuality(street({ checked: false }))).toBe('estimated');
    expect(featureQuality(street())).toBe('confirmed');
  });
});

describe('Timpark snapshot', () => {
  const file = fileURLToPath(new URL('./data/timpark.json', import.meta.url));
  it.runIf(existsSync(file))('the committed snapshot matches the schema', () => {
    const parsed = TimparkSnapshot.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    expect(parsed.success ? 'ok' : parsed.error.issues.slice(0, 3)).toBe('ok');
  });
});
