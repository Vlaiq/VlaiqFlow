import { describe, expect, it } from 'vitest';
import { simulateBuddyCity } from './city';
describe('Educational city, existing FLOW allocator', () => {
  it('is deterministic, respects capacity and conserves every person', () => {
    const params = { drivers: 30, capacity: 36, seed: 7 };
    for (const policy of ['nearest', 'balanced', 'transit'] as const) {
      const r = simulateBuddyCity(params, policy);
      expect(r).toEqual(simulateBuddyCity(params, policy));
      expect(r.assigned + r.unassigned + r.transitPassengers).toBe(30);
      expect(r.allocations.every((l) => l.occupied <= l.capacity)).toBe(true);
      expect(r.assumptions).toContain('Date sintetice');
      expect(r).not.toHaveProperty('co2Saved');
    }
    expect(simulateBuddyCity(params, 'nearest').allocations).not.toEqual(
      simulateBuddyCity(params, 'balanced').allocations,
    );
  });
  it('rejects unbounded scenario sizes', () => {
    expect(() =>
      simulateBuddyCity({ drivers: 100000, capacity: 36, seed: 7 }, 'nearest'),
    ).toThrow();
  });
});
