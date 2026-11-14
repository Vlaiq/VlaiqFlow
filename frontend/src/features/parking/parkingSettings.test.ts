import { describe, expect, it } from 'vitest';
import { DEFAULT_PARKING_SETTINGS, arriveIso } from './settings';
import { chanceLevel } from './recommendationLabels';

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
});

describe('estimated chance wording', () => {
  it('always gives a text level, from good to likely full', () => {
    expect(chanceLevel(0.9).label).toBe('Șanse bune');
    expect(chanceLevel(0.7).tone).toBe('good');
    expect(chanceLevel(0.5).label).toBe('Șanse medii');
    expect(chanceLevel(0.2).label).toBe('Risc mare să fie plin');
  });
});
