import { describe, expect, it } from 'vitest';
import { hoursToBuy, paidMinutesToday, paidWindowToday, ParkedCar, paymentEnd, reminderPlan } from './parkedCar';

// Published schedule shape (timpark.json): weekdays 8–20, Saturday only green 8–17, Sunday free.
const schedule = { weekdays: [8, 20] as [number, number], saturday: { green: [8, 17] as [number, number] } };
// 2026-11-16 is a Monday; Timișoara is UTC+2 in November.
const at = (hhmm: string, day = '2026-11-16') => new Date(`${day}T${hhmm}:00+02:00`);
const car = (over: Partial<ParkedCar> = {}): ParkedCar =>
  ParkedCar.parse({
    version: 1,
    name: 'Parcare test',
    coordinate: [21.2253, 45.7528],
    parkedAt: at('10:00').toISOString(),
    tariff: 'red',
    smsCode: '111',
    paidUntil: null,
    destination: null,
    ...over,
  });

describe('paid window', () => {
  it('is today 08:00–20:00 local time on a weekday, whatever the device zone', () => {
    const w = paidWindowToday('red', at('10:17'), schedule)!;
    expect(w.start.toISOString()).toBe('2026-11-16T06:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-11-16T18:00:00.000Z');
  });
  it('is free on Sunday and on Saturday for colours without Saturday hours', () => {
    expect(paidWindowToday('red', at('10:00', '2026-11-15'), schedule)).toBeNull();
    expect(paidWindowToday('red', at('10:00', '2026-11-14'), schedule)).toBeNull();
    expect(paidWindowToday('green', at('10:00', '2026-11-14'), schedule)).not.toBeNull();
  });
  it('counts only the paid part of a stay', () => {
    expect(paidMinutesToday('red', at('19:00'), 120, schedule)).toBe(60);
    expect(paidMinutesToday('red', at('07:30'), 60, schedule)).toBe(30);
    expect(hoursToBuy('red', at('19:00'), 180, schedule)).toBe(1);
    expect(hoursToBuy('red', at('10:00'), 90, schedule)).toBe(2);
  });
});

describe('reminder plan', () => {
  it('asks to leave walk + 5 min before the payment ends', () => {
    const paidUntil = paymentEnd(at('10:00'), 2);
    const plan = reminderPlan(car({ paidUntil: paidUntil.toISOString() }), at('10:30'), schedule, 8.2);
    expect(plan.state).toBe('running');
    if (plan.state !== 'running') return;
    expect(plan.leaveBy.toISOString()).toBe(at('11:46').toISOString());
  });
  it('says the payment covers the day when it lasts past the paid hours', () => {
    const plan = reminderPlan(car({ paidUntil: paymentEnd(at('19:30'), 1).toISOString() }), at('19:35'), schedule, 5);
    expect(plan.state).toBe('covered');
  });
  it('flags an expired payment, an unpaid stay, free hours and non-Timpark parkings', () => {
    expect(reminderPlan(car({ paidUntil: at('11:00').toISOString() }), at('11:01'), schedule, 5).state).toBe('expired');
    expect(reminderPlan(car(), at('11:00'), schedule, 5).state).toBe('unpaid');
    expect(reminderPlan(car(), at('21:00'), schedule, 5)).toEqual({ state: 'free_now', paidFrom: null });
    expect(reminderPlan(car(), at('07:00'), schedule, 5)).toEqual({ state: 'free_now', paidFrom: at('08:00') });
    expect(reminderPlan(car({ tariff: null }), at('11:00'), schedule, 5).state).toBe('not_timpark');
  });
});
