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
  /** School drop-off zones (§6.16). false = the user needs to reach the entrance by car on this trip. */
  schoolZone: boolean;
}

export const DEFAULT_PARKING_SETTINGS: ParkingSettings = {
  mode: 'balanced',
  stayMinutes: 120,
  maxWalkMinutes: 12,
  arrive: null,
  schoolZone: true,
};

export const PARKING_MODE_LABEL: Record<ParkingSettings['mode'], string> = {
  balanced: 'Echilibrat',
  cheap: 'Mai ieftin',
  less_walk: 'Mai puțin mers',
};

/** Value for <input type="datetime-local"> in the device's local time. */
export function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The DEMO arrival: the next Monday–Friday after `now`, at 10:00 device time. Timpark charges then,
 * so the demo shows real paid tariffs even when it is presented on a weekend.
 */
export function nextWeekdayAt10(now: Date): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return localInputValue(d);
}

/** ISO arrival time for the API, or undefined for "now". Invalid or out-of-range input means "now". */
export function arriveIso(s: ParkingSettings): string | undefined {
  if (!s.arrive) return undefined;
  const d = new Date(s.arrive);
  const year = d.getFullYear();
  return Number.isFinite(d.getTime()) && year >= 2020 && year <= 2100 ? d.toISOString() : undefined;
}
