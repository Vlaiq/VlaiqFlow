import type { AreaProfile } from '@vlaiq/shared';
import { publicHoliday } from './holidays';

/**
 * Rule-based occupancy model v2 (spec §7.3, level 1: "rules only").
 *
 * No live or historical occupancy exists for Timișoara (spec §5.2). Until real observations arrive
 * (user reports, Living Labs counts, Timpark payment counts), we use generic urban demand patterns:
 * offices and campuses fill during working hours, residential streets fill in the evening and at
 * night, malls peak on Saturday afternoon. The curves below are those ASSUMPTIONS written down as
 * numbers, so every result is `estimated` and the UI says it is not a measurement.
 *
 * To calibrate: replace a curve's values with observed shares per hour (see docs/spec.md §7.3).
 */

export type DayType = 'weekday' | 'saturday' | 'sunday';
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

const LOCAL = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Bucharest',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Local Timișoara slot of an instant: day type (a public holiday counts as Sunday), hour and minute. */
export function slotOf(at: Date): { day: DayType; hour: number; minute: number; holiday: string | null } {
  const parts = LOCAL.formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const holiday = publicHoliday(Number(get('year')), Number(get('month')), Number(get('day')));
  const weekday = WEEKDAY[get('weekday')] ?? 0;
  const day: DayType = holiday || weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : 'weekday';
  return { day, hour: Number(get('hour')), minute: Number(get('minute')), holiday };
}

function slotValue(profile: AreaProfile, at: Date): number {
  const { day, hour } = slotOf(at);
  return OCCUPANCY_CURVES[profile][day][hour]!;
}

/**
 * Expected occupancy at an instant. A curve value describes a whole hour, so it sits at the middle of
 * that hour and we interpolate linearly to the neighbouring hour (also across midnight and day types).
 * Arriving at 09:55 or at 10:05 therefore gives close values instead of a jump.
 */
export function expectedOccupancy(profile: AreaProfile, at: Date): number {
  const { minute } = slotOf(at);
  const HOUR = 60 * 60_000;
  const here = slotValue(profile, at);
  if (minute < 30) {
    const before = slotValue(profile, new Date(at.getTime() - HOUR));
    return before + (here - before) * ((minute + 30) / 60);
  }
  const after = slotValue(profile, new Date(at.getTime() + HOUR));
  return here + (after - here) * ((minute - 30) / 60);
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 approximation, error < 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** When the capacity is unknown we assume a small parking (pessimistic: it fills sooner). */
export const DEFAULT_CAPACITY = 20;
/**
 * Concentration κ of the Beta distribution of the occupied share. The day-to-day spread of the share is
 * √(μ(1−μ)/(κ+1)): κ = 8 gives ±10 points at 90 % (the σ of the first version), κ = 5 gives ±12 points
 * when we do not even know how big the parking is. Assumptions, to be fitted on observations.
 */
export const KAPPA_KNOWN = 8;
export const KAPPA_UNKNOWN = 5;
/** The curves are uncalibrated, so the model never claims near-certainty either way. */
export const P_MIN = 0.05;
export const P_MAX = 0.95;
/** Sensitivity band: how the answer moves if our typical occupancy is off by this many points. */
export const CURVE_ERROR = 0.1;

/**
 * In a big parking the last few free spaces are scattered and slow to find, so a driver experiences it
 * as full before it literally is. We ask for at least k = max(1, ⌈3 % · C⌉) free spaces. Assumption.
 */
export const FINDABLE_SHARE = 0.03;
export const findableSpaces = (capacity: number) => Math.max(1, Math.ceil(FINDABLE_SHARE * capacity));

/** ln Γ(x) for x > 0 (Lanczos, g = 7, 9 terms; relative error ≈ 1e-15). */
function lnGamma(x: number): number {
  const g = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = g[0]!;
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += g[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
const lnBeta = (a: number, b: number) => lnGamma(a) + lnGamma(b) - lnGamma(a + b);
const lnChoose = (n: number, k: number) => lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);

/**
 * P(at least `needed` of C spaces free) when the occupied share θ ~ Beta(μκ, (1−μ)κ) and, given θ, each
 * space is taken independently: the occupied count is beta-binomial. Computed exactly from the pmf.
 * Unlike the normal approximation of v1 this has the right shape at both ends: a small lot is often full
 * even when the area is only moderately busy, while a big lot needs a really busy day to fill up.
 */
export function betaBinomialFree(mean: number, capacity: number, kappa: number, needed = 1): number {
  const mu = Math.min(0.995, Math.max(0.005, mean));
  const alpha = mu * kappa;
  const beta = (1 - mu) * kappa;
  const base = lnBeta(alpha, beta);
  let pTooFew = 0; // occupied count n > C − needed
  for (let n = capacity - needed + 1; n <= capacity; n++) {
    pTooFew += Math.exp(lnChoose(capacity, n) + lnBeta(n + alpha, capacity - n + beta) - base);
  }
  return Math.min(1, Math.max(0, 1 - pTooFew));
}

const clamp = (p: number) => Math.round(Math.min(P_MAX, Math.max(P_MIN, p)) * 100) / 100;

export interface PFreeResult {
  value: number;
  /** The same model with the typical occupancy ±CURVE_ERROR: [pessimistic, optimistic]. */
  range?: [number, number];
  expectedOccupancy: number;
  factors: string[];
}

export interface PFreeContext {
  /** How the arrival time was obtained, in plain words (e.g. "acum + 12 min de condus"). */
  arrivalNote?: string;
}

const hhmm = (at: Date) =>
  new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);

/** Every intermediate value of one calculation, for the explainer page and the tests. */
export function pFreeDetail(profile: AreaProfile, at: Date, capacity: number | null) {
  const { day, hour, minute, holiday } = slotOf(at);
  const expected = Math.round(expectedOccupancy(profile, at) * 1000) / 1000;
  const known = capacity != null && capacity > 0;
  const c = known ? capacity : DEFAULT_CAPACITY;
  const kappa = known ? KAPPA_KNOWN : KAPPA_UNKNOWN;
  const needed = findableSpaces(c);
  const mu = Math.min(0.995, Math.max(0.005, expected));
  const raw = betaBinomialFree(expected, c, kappa, needed);
  const p = (m: number) => clamp(betaBinomialFree(m, c, kappa, needed));
  return {
    day,
    hour,
    minute,
    holiday,
    expected,
    known,
    capacityUsed: c,
    kappa,
    alpha: mu * kappa,
    beta: (1 - mu) * kappa,
    spread: Math.sqrt((mu * (1 - mu)) / (kappa + 1)),
    needed,
    raw,
    value: p(expected),
    clamped: raw < P_MIN || raw > P_MAX,
    range: [p(expected + CURVE_ERROR), p(expected - CURVE_ERROR)] as [number, number],
  };
}

/**
 * Probability that at least one space is free on arrival (spec §7.3, rule model v2).
 * Inputs: area profile, arrival instant, capacity (null when unknown).
 */
export function pFree(profile: AreaProfile, at: Date, capacity: number | null, ctx: PFreeContext = {}): PFreeResult {
  const d = pFreeDetail(profile, at, capacity);
  const { day, holiday, expected, known, needed, value, range } = d;
  const dayLabel = holiday ? `sărbătoare legală (${holiday}), tratată ca duminică` : DAY_LABEL_RO[day];
  const factors = [
    PROFILE_LABEL_RO[profile],
    `${dayLabel}, sosire ${hhmm(at)}${ctx.arrivalNote ? ` (${ctx.arrivalNote})` : ''} → ocupare tipică ~${Math.round(expected * 100)}%`,
    known
      ? `~${capacity} locuri${needed > 1 ? `; o socotim practic plină sub ${needed} locuri libere` : ''}`
      : `capacitate necunoscută (socotim ${DEFAULT_CAPACITY} locuri, cu incertitudine mai mare)`,
    `interval ${Math.round(range[0] * 100)}–${Math.round(range[1] * 100)}% dacă ocuparea tipică diferă cu ±${Math.round(CURVE_ERROR * 100)} puncte`,
  ];
  return { value, range, expectedOccupancy: expected, factors };
}
