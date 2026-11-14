/**
 * Parking settings shared by the "Unde parchezi" list and the Smart Journey car option, so both ask the
 * SmartMatch engine the same question and show the same parkings.
 */
export interface ParkingSettings {
  mode: 'balanced' | 'cheap' | 'less_walk';
  stayMinutes: number;
  maxWalkMinutes: number;
  /** Value of a datetime-local input in device time, or null for "now". */
  arrive: string | null;
}

export const DEFAULT_PARKING_SETTINGS: ParkingSettings = {
  mode: 'balanced',
  stayMinutes: 120,
  maxWalkMinutes: 12,
  arrive: null,
};

export const PARKING_MODE_LABEL: Record<ParkingSettings['mode'], string> = {
  balanced: 'Echilibrat',
  cheap: 'Mai ieftin',
  less_walk: 'Mai puțin mers',
};

/** ISO arrival time for the API, or undefined for "now". Invalid or out-of-range input means "now". */
export function arriveIso(s: ParkingSettings): string | undefined {
  if (!s.arrive) return undefined;
  const d = new Date(s.arrive);
  const year = d.getFullYear();
  return Number.isFinite(d.getTime()) && year >= 2020 && year <= 2100 ? d.toISOString() : undefined;
}
