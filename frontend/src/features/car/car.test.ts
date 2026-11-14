import { describe, expect, it } from 'vitest';
import { icsFile } from './calendar';
import { externalNavigation } from './handoff';
import { leaveTime } from './LeaveBy';
import { sameDayAt } from './BestTime';
import { handoffFromUrl, handoffParams } from '../navigation/scenario';

describe('trip helpers', () => {
  it('leave time = arrival − drive − walk − 5 min margin, rounded up to whole minutes', () => {
    const arrive = new Date('2026-11-16T08:00:00Z'); // 10:00 in Timișoara
    expect(leaveTime(arrive, 11.2, 6.4).toISOString()).toBe('2026-11-16T07:37:00.000Z');
  });

  it('builds a calendar file with an alarm at the start, escaping text', () => {
    const ics = icsFile(
      { title: 'Pleacă, acum; repede', description: 'linia 1\nlinia 2', start: new Date('2026-11-16T07:37:00Z') },
      new Date('2026-11-14T15:00:00Z'),
    );
    expect(ics).toContain('DTSTART:20261116T073700Z');
    expect(ics).toContain('SUMMARY:Pleacă\\, acum\\; repede');
    expect(ics).toContain('DESCRIPTION:linia 1\\nlinia 2');
    expect(ics).toContain('TRIGGER:PT0M');
    expect(ics.split('\r\n').at(-1)).toBe('');
  });

  it('hands off only the parking position, lat before lng as the apps expect', () => {
    const { google, waze } = externalNavigation([21.22528, 45.752819]);
    expect(google).toBe('https://www.google.com/maps/dir/?api=1&destination=45.752819%2C21.225280&travelmode=driving');
    expect(waze).toBe('https://waze.com/ul?ll=45.752819%2C21.225280&navigate=yes');
  });

  it('finds a full hour on the same Timișoara day', () => {
    expect(sameDayAt(new Date('2026-11-16T08:17:00Z'), 18).toISOString()).toBe('2026-11-16T16:00:00.000Z');
  });

  it('carries the Timpark facts to the navigation screen and drops bad ones', () => {
    const ok = handoffFromUrl(`?${new URLSearchParams(handoffParams({ parking: { tariff: 'red', smsCode: '111', stayMinutes: 120 } }))}`);
    expect(ok.parking).toEqual({ tariff: 'red', smsCode: '111', stayMinutes: 120 });
    expect(handoffFromUrl('?tariff=purple&sms=abc&stay=9999').parking).toEqual({ tariff: null, smsCode: null, stayMinutes: null });
  });
});
