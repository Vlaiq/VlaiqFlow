import type { DataQuality } from './schemas/quality';
import type { TariffColor, TimparkFeature, TimparkTariffs } from './schemas/timpark';

/**
 * The source field is named `eur` (spec D10, not yet confirmed with the City Hall).
 * We show the value with this unit exactly as given and never convert it.
 */
export const TIMPARK_CURRENCY = 'EUR' as const;

export const TARIFF_LABEL_RO: Record<TariffColor, string> = {
  green: 'verde',
  red: 'roșu',
  yellow: 'galben',
  blue: 'albastru',
};

/** City tariff colours, used for the map layers and the legend. */
export const TARIFF_HEX: Record<TariffColor, string> = {
  green: '#22C55E',
  red: '#EF4444',
  yellow: '#EAB308',
  blue: '#3B82F6',
};

export const KIND_LABEL_RO = { zone: 'Zonă', lot: 'Parcare', street: 'Stradă' } as const;

/** Romanian number format: 0,42 (decimal comma), always two decimals. */
export const formatAmountRo = (n: number): string =>
  n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Geometry trust: the City Hall marks features checked against the 2026 tariff annex. */
export const featureQuality = (f: TimparkFeature): DataQuality => (f.checked ? 'confirmed' : 'estimated');

export type HourlyPrice =
  | { type: 'hourly'; amount: number; currency: typeof TIMPARK_CURRENCY; smsCode: string }
  | { type: 'progressive'; steps: { amount: number; smsCode: string }[]; currency: typeof TIMPARK_CURRENCY };

/** The hourly price that applies to a feature. Progressive features list their steps as published. */
export function hourlyPrice(f: TimparkFeature, tariffs: TimparkTariffs): HourlyPrice {
  if (f.progressive) {
    return {
      type: 'progressive',
      currency: TIMPARK_CURRENCY,
      steps: tariffs.progressive.map((s) => ({ amount: s.eur, smsCode: s.code })),
    };
  }
  const p = tariffs.hourly[f.tariff];
  return { type: 'hourly', amount: p.eur, currency: TIMPARK_CURRENCY, smsCode: p.code };
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

/** Weekday (0 = Sunday) and hour in Timișoara local time, independent of the device's time zone. */
export function timisoaraClock(date: Date): { weekday: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bucharest',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

/** The paid window [startHour, endHour) for a tariff on that day, or null when parking is free all day. */
export function paidWindow(tariff: TariffColor, date: Date, schedule: TimparkTariffs['schedule']): [number, number] | null {
  const { weekday } = timisoaraClock(date);
  if (weekday >= 1 && weekday <= 5) return schedule.weekdays;
  if (weekday === 6) return schedule.saturday[tariff] ?? null;
  return null; // Sunday: no paid window in the published schedule
}

export function isPaidAt(tariff: TariffColor, date: Date, schedule: TimparkTariffs['schedule']): boolean {
  const window = paidWindow(tariff, date, schedule);
  if (!window) return false;
  const { hour, minute } = timisoaraClock(date);
  const t = hour + minute / 60;
  return t >= window[0] && t < window[1];
}

/** Plain Romanian description of the published schedule, for the legend. */
export function describeSchedule(schedule: TimparkTariffs['schedule']): string {
  const [ws, we] = schedule.weekdays;
  const sat = Object.entries(schedule.saturday)
    .map(([color, [s, e]]) => `${TARIFF_LABEL_RO[color as TariffColor] ?? color} ${s}–${e}`)
    .join(', ');
  return `Luni–vineri ${ws}–${we}${sat ? `; sâmbătă doar ${sat}` : '; sâmbătă gratuit'}; duminică gratuit`;
}
