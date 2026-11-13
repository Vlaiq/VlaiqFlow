import { describe, expect, it } from 'vitest';
import { makeBalanceScenario, simulateFlowBalance } from './balance';

describe('FLOW Balance synthetic allocation', () => {
  it('is deterministic for the same inputs and preserves all drivers', () => {
    const scenario = makeBalanceScenario(80, 65, 7);
    for (const strategy of ['nearest', 'balanced'] as const) {
      const result = simulateFlowBalance(scenario, strategy);
      expect(result).toEqual(simulateFlowBalance(scenario, strategy));
      expect(result.assigned + result.unassigned).toBe(80);
      expect(result.assigned).toBe(65);
      expect(result.allocations.reduce((sum, lot) => sum + lot.occupied, 0)).toBe(result.assigned);
    }
  });
  it('never exceeds a lot capacity under either strategy', () => {
    for (let seed = 0; seed < 20; seed++)
      for (const strategy of ['nearest', 'balanced'] as const) {
        const result = simulateFlowBalance(makeBalanceScenario(200, 41, seed), strategy);
        expect(result.allocations.every((l) => l.occupied <= l.capacity && l.occupied >= 0)).toBe(
          true,
        );
        expect(result.unassigned).toBe(159);
      }
  });
  it('does not make balanced allocation win by inventing capacity or dropping walking cost', () => {
    const scenario = makeBalanceScenario(36, 80, 12);
    const nearest = simulateFlowBalance(scenario, 'nearest'),
      balanced = simulateFlowBalance(scenario, 'balanced');
    expect(nearest.assigned).toBe(balanced.assigned);
    expect(balanced.averageJourneyMinutes).toBeCloseTo(
      balanced.averageDriveMinutes + balanced.averageWalkMinutes,
    );
    expect(nearest.averageJourneyMinutes).toBeCloseTo(
      nearest.averageDriveMinutes + nearest.averageWalkMinutes,
    );
  });
  it('handles no demand without producing non-finite statistics', () => {
    const result = simulateFlowBalance(makeBalanceScenario(0, 3), 'balanced');
    expect(result.assigned).toBe(0);
    expect(result.unassigned).toBe(0);
    expect(result.averageJourneyMinutes).toBe(0);
  });
  it('rejects invalid scenario inputs', () => {
    expect(() => makeBalanceScenario(201, 30)).toThrow();
    expect(() => makeBalanceScenario(10, 2)).toThrow();
    expect(() => makeBalanceScenario(2.2, 10)).toThrow();
  });
});
