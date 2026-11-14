import { describe, expect, it } from 'vitest';
import {
  ActiveJourneyContext,
  CompleteJourney,
  CompleteJourneyRequest,
  DurationMetric,
  JourneyMoney,
} from './completeJourney';
import { activeJourney } from '../../test-fixtures/completeJourney';
describe('complete journey contract', () => {
  it('parses an active journey with canonical seconds/meters and explicit provider', () => {
    const parsed = CompleteJourney.parse(activeJourney());
    expect(parsed.travelSeconds.value).toBe(420);
    expect(parsed.legs[0]?.type).toBe('cycle');
  });
  it.each([
    [181, 45],
    [21, 91],
    [Infinity, 45],
    [NaN, 45],
  ])('rejects invalid coordinates %s,%s', (lng, lat) => {
    expect(
      CompleteJourneyRequest.safeParse({ origin: [lng, lat], destination: [21, 45] }).success,
    ).toBe(false);
  });
  it('rejects missing origin, unsupported transit, duplicate modes and spoofed input fields', () => {
    const base = { origin: [21, 45], destination: [21.1, 45.1] };
    for (const req of [
      { destination: base.destination },
      { ...base, modes: ['transit'] },
      { ...base, modes: ['cycle', 'cycle'] },
      { ...base, coins: 100 },
    ])
      expect(CompleteJourneyRequest.safeParse(req).success).toBe(false);
  });
  it.each([-1, Infinity, NaN])('rejects invalid duration %s', (duration) => {
    const j = activeJourney();
    j.legs[0] = { ...j.legs[0]!, duration: { ...j.legs[0]!.duration, value: duration } };
    expect(CompleteJourney.safeParse(j).success).toBe(false);
  });
  it('rejects malformed geometry and out-of-range maneuver indices', () => {
    const j = activeJourney();
    const leg = j.legs[0]!;
    if (leg.type === 'parking') return;
    leg.route.geometry = [
      [190, 45],
      [21, 45],
    ];
    expect(CompleteJourney.safeParse(j).success).toBe(false);
    leg.route.geometry = [
      [21, 45],
      [21.1, 45.1],
    ];
    leg.route.steps[0]!.index = 9;
    expect(CompleteJourney.safeParse(j).success).toBe(false);
  });
  it('rejects inconsistent units, totals, endpoints and mode order', () => {
    for (const change of [
      (j: any) => {
        j.travelSeconds.unit = 'min';
      },
      (j: any) => {
        j.distance.value = 10;
      },
      (j: any) => {
        j.origin = [21, 45];
      },
      (j: any) => {
        j.category = 'walk';
      },
    ]) {
      const j = activeJourney();
      change(j);
      expect(CompleteJourney.safeParse(j).success).toBe(false);
    }
  });
  it('unknown duration and fee stay null; an unknown zero is invalid', () => {
    expect(
      DurationMetric.parse({ value: null, unit: 's', quality: 'unknown', source: 'none' }).value,
    ).toBeNull();
    expect(
      DurationMetric.safeParse({ value: 0, unit: 's', quality: 'unknown', source: 'none' }).success,
    ).toBe(false);
    expect(
      JourneyMoney.parse({
        minorUnits: null,
        currency: null,
        quality: 'unknown',
        source: 'none',
        note: '',
      }).minorUnits,
    ).toBeNull();
    expect(
      JourneyMoney.safeParse({
        minorUnits: 150,
        currency: null,
        quality: 'confirmed',
        source: 'none',
        note: '',
      }).success,
    ).toBe(false);
  });
  it('planned activity requires provenance and cannot include a reward override', () => {
    expect(ActiveJourneyContext.safeParse({ ...activeJourney(), coins: 10 }).success).toBe(false);
  });
});
