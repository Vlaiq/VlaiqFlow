/** Synthetic allocation experiment. These are policy assumptions, never observed city traffic. */
export interface BalanceLot {
  id: string;
  name: string;
  capacity: number;
}
export interface BalanceDriver {
  id: string;
  choices: { lotId: string; driveMinutes: number; walkMinutes: number }[];
}
export interface BalanceScenario {
  lots: BalanceLot[];
  drivers: BalanceDriver[];
  seed: number;
}
export interface BalanceResult {
  strategy: 'nearest' | 'balanced';
  assigned: number;
  unassigned: number;
  averageDriveMinutes: number;
  averageWalkMinutes: number;
  averageJourneyMinutes: number;
  allocations: { lotId: string; name: string; occupied: number; capacity: number }[];
}

const validInt = (n: number, min: number, max: number) =>
  Number.isInteger(n) && n >= min && n <= max;

export function makeBalanceScenario(
  driverCount: number,
  totalCapacity: number,
  seed = 7,
): BalanceScenario {
  if (
    !validInt(driverCount, 0, 200) ||
    !validInt(totalCapacity, 3, 200) ||
    !validInt(seed, 0, 1000000)
  ) {
    throw new Error('Scenariu invalid: maximum 200 de șoferi și 3–200 de locuri virtuale.');
  }
  const first = Math.max(1, Math.floor(totalCapacity * 0.45));
  const second = Math.max(1, Math.floor(totalCapacity * 0.35));
  const lots = [
    { id: 'a', name: 'Parcarea virtuală A', capacity: first },
    { id: 'b', name: 'Parcarea virtuală B', capacity: second },
    { id: 'c', name: 'Parcarea virtuală C', capacity: totalCapacity - first - second },
  ];
  const drivers = Array.from({ length: driverCount }, (_, i) => ({
    id: `virtual-${i + 1}`,
    choices: lots.map((lot, j) => ({
      lotId: lot.id,
      // Repeatable heterogeneous preferences; not routes, traffic or measured speeds.
      driveMinutes: 3 + j * 2 + ((i * 13 + seed * 7 + j * 3) % 7),
      walkMinutes: 2 + ((i * 5 + seed * 3 + (2 - j) * 4) % 9),
    })),
  }));
  return { lots, drivers, seed };
}

export function simulateFlowBalance(
  scenario: BalanceScenario,
  strategy: 'nearest' | 'balanced',
): BalanceResult {
  const capacity = new Map(scenario.lots.map((l) => [l.id, l.capacity]));
  if (
    capacity.size !== scenario.lots.length ||
    scenario.lots.some((l) => !validInt(l.capacity, 0, 100000))
  )
    throw new Error('Capacități invalide.');
  const occupied = new Map(scenario.lots.map((l) => [l.id, 0]));
  let assigned = 0,
    drive = 0,
    walk = 0;
  for (const driver of scenario.drivers) {
    const candidates = driver.choices.filter((c) => {
      const cap = capacity.get(c.lotId);
      return (
        cap != null &&
        (occupied.get(c.lotId) ?? 0) < cap &&
        Number.isFinite(c.driveMinutes) &&
        c.driveMinutes >= 0 &&
        Number.isFinite(c.walkMinutes) &&
        c.walkMinutes >= 0
      );
    });
    const cost = (c: BalanceDriver['choices'][number]) =>
      strategy === 'nearest'
        ? c.driveMinutes
        : c.driveMinutes +
          c.walkMinutes +
          (8 * (occupied.get(c.lotId) ?? 0)) / (capacity.get(c.lotId) || 1);
    candidates.sort((a, b) => cost(a) - cost(b) || a.lotId.localeCompare(b.lotId));
    const chosen = candidates[0];
    if (!chosen) continue;
    occupied.set(chosen.lotId, (occupied.get(chosen.lotId) ?? 0) + 1);
    assigned++;
    drive += chosen.driveMinutes;
    walk += chosen.walkMinutes;
  }
  return {
    strategy,
    assigned,
    unassigned: scenario.drivers.length - assigned,
    averageDriveMinutes: assigned ? drive / assigned : 0,
    averageWalkMinutes: assigned ? walk / assigned : 0,
    averageJourneyMinutes: assigned ? (drive + walk) / assigned : 0,
    allocations: scenario.lots.map((l) => ({
      lotId: l.id,
      name: l.name,
      occupied: occupied.get(l.id) ?? 0,
      capacity: l.capacity,
    })),
  };
}
