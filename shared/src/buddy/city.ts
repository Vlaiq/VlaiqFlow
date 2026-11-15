import { makeBalanceScenario, simulateFlowBalance, type BalanceResult } from '../balance';
import type { CityStrategy } from './contracts';

export interface CityOutcome extends BalanceResult {
  policy: CityStrategy;
  transitPassengers: number;
  totalArrived: number;
  peakOccupancy: number;
  assumptions: string;
}
/** Reuses FLOW City's allocator. Fixed virtual preferences; never routing or observed traffic. */
export function simulateBuddyCity(
  parameters: { drivers: number; capacity: number; seed: number },
  policy: CityStrategy,
): CityOutcome {
  const transitPassengers = policy === 'transit' ? Math.min(12, parameters.drivers) : 0;
  const scenario = makeBalanceScenario(
    parameters.drivers - transitPassengers,
    parameters.capacity,
    parameters.seed,
  );
  const result = simulateFlowBalance(scenario, policy === 'nearest' ? 'nearest' : 'balanced');
  return {
    ...result,
    policy,
    transitPassengers,
    totalArrived: result.assigned + transitPassengers,
    peakOccupancy: Math.max(
      0,
      ...result.allocations.map((l) => (l.capacity ? l.occupied / l.capacity : 0)),
    ),
    assumptions:
      'Date sintetice: preferințe fixe, fără cozi sau trafic măsurat. La park & ride, 12 persoane folosesc un autobuz virtual disponibil; timpul acestuia nu este modelat. Mediile descriu doar șoferii parcați. Nu calculăm CO₂.',
  };
}
