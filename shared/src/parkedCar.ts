import { z } from 'zod';
import { Coordinate } from './schemas/navigation';
import { TariffColor, type TimparkTariffs } from './schemas/timpark';
import { paidWindow, timisoaraClock } from './timpark';

/**
 * "Where is my car" (spec §6.17). Saved only on the user's device. Every time and price here comes from
 * the user's own input or the published Timpark schedule; we do not know whether or what they paid.
 */
export const ParkedCar = z.object({
  version: z.literal(1),
  name: z.string().min(1).max(120),
  coordinate: Coordinate,
  parkedAt: z.string().datetime({ offset: true }),
  /** Timpark tariff colour of the parking, null when it is not a Timpark place. */
  tariff: TariffColor.nullable(),
  smsCode: z.string().max(10).nullable(),
  /** When the user's own payment ends, as they told us; null = not told. */
  paidUntil: z.string().datetime({ offset: true }).nullable(),
  destination: z.object({ name: z.string().max(120), coordinate: Coordinate }).nullable(),
  /** Walk destination → car in minutes, from the recommendation or the walking route (estimated). */
  walkMinutes: z.number().nonnegative().max(120).nullable().default(null),
  /** Stay the user planned, for the "hours to buy" hint. */
  stayMinutes: z.number().int().min(15).max(600).nullable().default(null),
});
export type ParkedCar = z.infer<typeof ParkedCar>;
export type ParkedCarInput = z.input<typeof ParkedCar>;

type Schedule = TimparkTariffs['schedule'];
const MIN = 60_000;
/** Minutes kept free before the payment ends, so the user is at the car in time. */
export const LEAVE_BUFFER_MIN = 5;

/** Today's paid window in Timișoara time as two instants, or null when that day is free. */
export function paidWindowToday(tariff: TariffColor, at: Date, schedule: Schedule): { start: Date; end: Date } | null {
  const window = paidWindow(tariff, at, schedule);
  if (!window) return null;
  const { hour, minute } = timisoaraClock(at);
  const midnight = at.getTime() - (hour * 60 + minute) * MIN - at.getSeconds() * 1000 - at.getMilliseconds();
  return { start: new Date(midnight + window[0] * 60 * MIN), end: new Date(midnight + window[1] * 60 * MIN) };
}

/** Paid minutes of a stay [start, start + stay) that fall in today's paid window. */
export function paidMinutesToday(tariff: TariffColor, start: Date, stayMinutes: number, schedule: Schedule): number {
  const w = paidWindowToday(tariff, start, schedule);
  if (!w) return 0;
  const from = Math.max(start.getTime(), w.start.getTime());
  const to = Math.min(start.getTime() + stayMinutes * MIN, w.end.getTime());
  return Math.max(0, Math.round((to - from) / MIN));
}

export type ReminderPlan =
  | { state: 'not_timpark' }
  /** Outside the paid hours now; `paidFrom` is when paying starts later today, if it does. */
  | { state: 'free_now'; paidFrom: Date | null }
  /** Paid hours, and the user has not told us about a payment. */
  | { state: 'unpaid'; freeFrom: Date }
  /** The payment lasts past the end of today's paid hours: nothing to remind. */
  | { state: 'covered'; paidUntil: Date; freeFrom: Date }
  | { state: 'running'; paidUntil: Date; leaveBy: Date; freeFrom: Date }
  | { state: 'expired'; paidUntil: Date; freeFrom: Date };

/** What the "Mașina ta" card says about paying, from the published schedule and the user's own input. */
export function reminderPlan(car: ParkedCar, now: Date, schedule: Schedule, walkMinutes: number | null): ReminderPlan {
  if (!car.tariff) return { state: 'not_timpark' };
  const w = paidWindowToday(car.tariff, now, schedule);
  if (!w || now >= w.end) return { state: 'free_now', paidFrom: null };
  if (now < w.start && !car.paidUntil) return { state: 'free_now', paidFrom: w.start };
  if (!car.paidUntil) return { state: 'unpaid', freeFrom: w.end };
  const paidUntil = new Date(car.paidUntil);
  if (paidUntil >= w.end) return { state: 'covered', paidUntil, freeFrom: w.end };
  if (now >= paidUntil) return { state: 'expired', paidUntil, freeFrom: w.end };
  const walk = Math.ceil(walkMinutes ?? 0);
  return { state: 'running', paidUntil, leaveBy: new Date(paidUntil.getTime() - (walk + LEAVE_BUFFER_MIN) * MIN), freeFrom: w.end };
}

/**
 * Hours to buy now for a stay. One Timpark SMS buys one hour, so started paid hours count; time after the
 * paid window ends is free and is not bought.
 */
export function hoursToBuy(tariff: TariffColor, now: Date, stayMinutes: number, schedule: Schedule): number {
  return Math.ceil(paidMinutesToday(tariff, now, stayMinutes, schedule) / 60);
}

/** The end of a payment of `hours` started at `now`: an SMS hour runs from the moment it is sent. */
export function paymentEnd(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 60 * MIN);
}
