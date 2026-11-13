import { describe, expect, it } from 'vitest';
import {
  JourneyComparisonRequest,
  JourneyOption,
  chooseJourney,
  findFlowOpportunity,
  journeyPractical,
  type JourneyMode,
} from './journey';

function option(mode: JourneyMode, duration: number, distance = 1200): JourneyOption {
  return {
    id: `journey-${mode}`,
    mode,
    practical: journeyPractical(mode, duration),
    note: 'Synthetic test fixture',
    route: {
      id: `test-${mode}`,
      geometry: [
        [21.22, 45.75],
        [21.221, 45.751],
      ],
      distance,
      duration,
      source: 'TEST FIXTURE',
      quality: 'estimated',
      steps: [
        { index: 0, type: 'depart', road: '' },
        { index: 1, type: 'arrive', road: '' },
      ],
    },
  };
}
describe('Green Switch preference policy', () => {
  it('uses duration for fastest and a practical active route for green, without changing route metrics', () => {
    const drive = option('drive', 300),
      cycle = option('cycle', 540),
      walk = option('walk', 1500);
    const options = [drive, cycle, walk];
    expect(chooseJourney(options, 'fastest')).toBe(drive);
    expect(chooseJourney(options, 'balanced')).toBe(cycle);
    expect(chooseJourney(options, 'green')).toBe(cycle);
    expect(cycle.route.duration).toBe(540);
  });
  it('keeps a fast drive when the active alternative adds more than five minutes', () => {
    const drive = option('drive', 200),
      cycle = option('cycle', 600);
    expect(chooseJourney([drive, cycle], 'balanced')).toBe(drive);
  });
  it('never selects an unavailable route or invents one when all providers fail', () => {
    expect(chooseJourney([], 'green')).toBeUndefined();
    expect(chooseJourney([option('drive', 300)], 'green')?.mode).toBe('drive');
  });
});
describe('FLOW Opportunity', () => {
  it('requires a real driving comparison and a practical calculated active alternative', () => {
    expect(findFlowOpportunity([option('cycle', 600)])).toBeNull();
    expect(findFlowOpportunity([option('drive', 300)])).toBeNull();
    expect(findFlowOpportunity([option('drive', 300), option('cycle', 900)])).toMatchObject({
      mode: 'cycle',
      extraSeconds: 600,
      activeMeters: 1200,
    });
  });
  it('does not suggest a route beyond duration and extra-time limits', () => {
    expect(findFlowOpportunity([option('drive', 300), option('walk', 2400)])).toBeNull();
    expect(findFlowOpportunity([option('drive', 300), option('cycle', 1800)])).toBeNull();
  });
  it('can explain when an active route is actually faster and never invents carbon or price figures', () => {
    const result = findFlowOpportunity([option('drive', 600), option('walk', 480)]);
    expect(result?.extraSeconds).toBe(-120);
    expect(result?.mode).toBe('walk');
    expect(result).not.toHaveProperty('carbon');
    expect(result).not.toHaveProperty('cost');
  });
  it('rejects invalid origins, client fields and nonfinite provider metrics', () => {
    expect(
      JourneyComparisonRequest.safeParse({ origin: [21, 95], destination: [21.2, 45.75] }).success,
    ).toBe(false);
    expect(
      JourneyComparisonRequest.safeParse({
        origin: [21.2, 45.75],
        destination: [21.2, 45.76],
        providerUrl: 'https://example.com',
      }).success,
    ).toBe(false);
    const invalid = option('walk', 600);
    invalid.route.duration = Infinity;
    expect(JourneyOption.safeParse(invalid).success).toBe(false);
  });
});
