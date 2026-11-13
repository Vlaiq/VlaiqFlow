import { timisoaraClock, type AreaProfile } from '@vlaiq/shared';

/**
 * Rule-based occupancy model (spec §7.3, level 1: "rules only").
 *
 * No live or historical occupancy exists for Timișoara (spec §5.2). Until real observations arrive
 * (user reports, Living Labs counts, Timpark payment counts), we use generic urban demand patterns:
 * offices and campuses fill during working hours, residential streets fill in the evening and at
 * night, malls peak on Saturday afternoon. The curves below are those ASSUMPTIONS written down as
 * numbers, so every result is `estimated` and the UI says it is not a measurement.
 *
 * To calibrate: replace a curve's values with observed shares per hour (see docs/spec.md §7.3).
 */

type DayType = 'weekday' | 'saturday' | 'sunday';
type Curve = number[]; // 24 values, expected share of occupied spaces in hour h

/** Build a 24-hour curve from [fromHour, toHour, value] ranges over a base value. */
function curve(base: number, ranges: [number, number, number][]): Curve {
  const c = Array.from({ length: 24 }, () => base);
  for (const [from, to, v] of ranges) for (let h = from; h < to; h++) c[h] = v;
  return c;
}

export const OCCUPANCY_CURVES: Record<AreaProfile, Record<DayType, Curve>> = {
  // Paid central zones (Timpark green / red): busy all day, busiest at lunch and early evening.
  centre: {
    weekday: curve(0.6, [[8, 10, 0.78], [10, 14, 0.9], [14, 17, 0.86], [17, 22, 0.92], [22, 24, 0.8]]),
    saturday: curve(0.6, [[9, 11, 0.75], [11, 21, 0.88], [21, 24, 0.82]]),
    sunday: curve(0.5, [[11, 20, 0.75], [20, 23, 0.65]]),
  },
  // Malls and large shops: quiet in the morning, peak on Saturday afternoon.
  commercial: {
    weekday: curve(0.1, [[9, 12, 0.3], [12, 17, 0.45], [17, 21, 0.65], [21, 22, 0.3]]),
    saturday: curve(0.1, [[9, 11, 0.4], [11, 13, 0.65], [13, 19, 0.88], [19, 22, 0.6]]),
    sunday: curve(0.1, [[10, 12, 0.45], [12, 19, 0.75], [19, 21, 0.45]]),
  },
  // Universities: full while classes run on weekdays.
  campus: {
    weekday: curve(0.3, [[8, 15, 0.92], [15, 18, 0.75], [18, 20, 0.5]]),
    saturday: curve(0.25, [[9, 14, 0.4]]),
    sunday: curve(0.2, []),
  },
  // Hospitals: staff in the morning, visitors in the afternoon.
  hospital: {
    weekday: curve(0.5, [[7, 15, 0.92], [15, 19, 0.8]]),
    saturday: curve(0.45, [[10, 18, 0.7]]),
    sunday: curve(0.45, [[10, 18, 0.7]]),
  },
  // Railway and bus stations: steady during the day.
  station: {
    weekday: curve(0.4, [[6, 9, 0.75], [9, 18, 0.8], [18, 21, 0.7]]),
    saturday: curve(0.4, [[8, 20, 0.7]]),
    sunday: curve(0.4, [[10, 21, 0.75]]),
  },
  // Housing estates: residents leave in the morning and are back in the evening.
  residential: {
    weekday: curve(0.92, [[8, 16, 0.6], [16, 18, 0.75], [18, 21, 0.88]]),
    saturday: curve(0.85, [[10, 18, 0.75]]),
    sunday: curve(0.88, [[11, 18, 0.8]]),
  },
};

export const PROFILE_LABEL_RO: Record<AreaProfile, string> = {
  centre: 'zonă centrală cu plată',
  commercial: 'zonă comercială (mall, magazine)',
  campus: 'campus universitar',
  hospital: 'zonă de spital',
  station: 'lângă gară / autogară',
  residential: 'zonă rezidențială',
};

const DAY_LABEL_RO: Record<DayType, string> = { weekday: 'zi lucrătoare', saturday: 'sâmbătă', sunday: 'duminică' };

function dayType(weekday: number): DayType {
  return weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : 'weekday';
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 approximation, error < 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** When the capacity is unknown we assume a small parking (pessimistic: it fills sooner). */
export const DEFAULT_CAPACITY = 20;
const P_MIN = 0.05;
const P_MAX = 0.95;

export interface PFreeResult {
  value: number;
  expectedOccupancy: number;
  factors: string[];
}

/**
 * Probability that at least one space is free on arrival.
 * Actual occupancy is modelled as Normal(expected, σ); the parking has room when occupancy < 1 − 1/C.
 * σ is wider when we do not know the capacity, so the model is less sure of itself.
 */
export function pFree(profile: AreaProfile, at: Date, capacity: number | null): PFreeResult {
  const { weekday, hour } = timisoaraClock(at);
  const day = dayType(weekday);
  const expected = OCCUPANCY_CURVES[profile][day][hour]!;
  const c = capacity ?? DEFAULT_CAPACITY;
  const sigma = capacity == null ? 0.14 : 0.1;
  const raw = normalCdf((1 - 1 / c - expected) / sigma);
  const value = Math.round(Math.min(P_MAX, Math.max(P_MIN, raw)) * 100) / 100;
  const factors = [
    PROFILE_LABEL_RO[profile],
    `${DAY_LABEL_RO[day]}, ora ${String(hour).padStart(2, '0')}:00 → ocupare tipică ~${Math.round(expected * 100)}%`,
    capacity == null ? `capacitate necunoscută (socotim ${DEFAULT_CAPACITY} locuri)` : `${capacity} locuri`,
  ];
  return { value, expectedOccupancy: expected, factors };
}
