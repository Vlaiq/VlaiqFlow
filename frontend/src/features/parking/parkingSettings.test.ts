import { describe, expect, it } from 'vitest';
import { DEFAULT_PARKING_SETTINGS, arriveIso, nextWeekdayAt10 } from './settings';
import { chanceLevel, scoreLines } from './recommendationLabels';

describe('score breakdown shows the real price next to its minute equivalent', () => {
  const base = {
    score: { walk: 2.9, risk: 0.6, price: 19.2, total: 22.7 },
    freeChance: 0.95,
    params: { fullPenaltyMinutes: 12, minutesPerCurrency: 8 },
  };
  it('explains a known price as amount × minutes per currency unit', () => {
    const price = scoreLines({ ...base, price: { amount: 2.4, currency: 'EUR' } }).find(
      (l) => l.id === 'price',
    )!;
    expect(price.how).toBe('2,40 EUR × 8 min pentru fiecare EUR');
    expect(price.minutes).toBe(19.2);
  });
  it('says free and unknown in words, never as a bare "0 min" price', () => {
    const free = scoreLines({ ...base, price: { amount: 0, currency: 'EUR' } });
    expect(free.find((l) => l.id === 'price')!.how).toBe('gratuit la ora aleasă');
    const unknown = scoreLines({ ...base, price: { amount: null, currency: null } });
    expect(unknown.find((l) => l.id === 'price')!.how).toMatch(/^necunoscut: socotit ca cel mai scump/);
  });
  it('explains the risk with the full-parking penalty and adds drive only when known', () => {
    const lines = scoreLines({ ...base, price: { amount: 0, currency: 'EUR' } });
    expect(lines.find((l) => l.id === 'risk')!.how).toBe('~5% risc × 12 min pierdute dacă e plin');
    expect(lines.some((l) => l.id === 'drive')).toBe(false);
    const withDrive = scoreLines({
      ...base,
      score: { ...base.score, drive: 6 },
      price: { amount: 0, currency: 'EUR' },
    });
    expect(withDrive[0]).toMatchObject({ id: 'drive', minutes: 6 });
  });
});

describe('shared parking settings', () => {
  it('sends no arrival time for "now" or for invalid input', () => {
    expect(arriveIso(DEFAULT_PARKING_SETTINGS)).toBeUndefined();
    expect(arriveIso({ ...DEFAULT_PARKING_SETTINGS, arrive: 'not a date' })).toBeUndefined();
    expect(arriveIso({ ...DEFAULT_PARKING_SETTINGS, arrive: '1999-01-01T10:00' })).toBeUndefined();
  });
  it('turns a device-time arrival into an ISO timestamp', () => {
    const iso = arriveIso({ ...DEFAULT_PARKING_SETTINGS, arrive: '2026-11-14T18:30' });
    expect(iso).toBe(new Date('2026-11-14T18:30').toISOString());
  });
  it('DEMO arrival is the next weekday at 10:00, so paid tariffs show on weekends', () => {
    expect(nextWeekdayAt10(new Date('2026-11-14T15:00'))).toBe('2026-11-16T10:00'); // Saturday → Monday
    expect(nextWeekdayAt10(new Date('2026-11-15T09:00'))).toBe('2026-11-16T10:00'); // Sunday → Monday
    expect(nextWeekdayAt10(new Date('2026-11-16T08:00'))).toBe('2026-11-17T10:00'); // Monday → Tuesday
    expect(nextWeekdayAt10(new Date('2026-11-20T12:00'))).toBe('2026-11-23T10:00'); // Friday → Monday
  });
});

describe('estimated chance wording', () => {
  it('always gives a text level, from good to likely full', () => {
    expect(chanceLevel(0.9).label).toBe('Șanse bune');
    expect(chanceLevel(0.7).tone).toBe('good');
    expect(chanceLevel(0.5).label).toBe('Șanse medii');
    expect(chanceLevel(0.2).label).toBe('Risc mare să fie plin');
  });
});
