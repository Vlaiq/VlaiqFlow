import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeGtfs, validateDigest } from './gtfsParser';
import { createServiceCalendar, localServiceDate, parseGtfsTime, serviceDayEpoch } from './gtfsCalendar';
import { TransitIndex } from './gtfsIndex';
import { departuresForStop } from './departures';
import { fixtureDigest, fixtureTables } from './fixtures';
import { loadTransitIndex, writeTransitDigest } from './transitData';

const normalize = (t: ReturnType<typeof fixtureTables>) => normalizeGtfs(t, fixtureDigest().metadata);
describe('strict feed normalization and relationships', () => {
  it('keeps column order independent, tuple fields, duplicate names, timezone and provenance', () => {
    const d = fixtureDigest();
    expect(d.stops.filter((s) => s.name === 'Same synthetic name')).toHaveLength(2);
    expect(d.stops[1]?.coordinate).toEqual([21.221, 45.751]);
    expect(d.metadata.timezone).toBe('Europe/Bucharest');
    expect(d.stopTimes[8]?.[4]).toBe(90900);
    expect(d.metadata.validation.warnings.join(' ')).toMatch(/wheelchair/);
  });
  it('allows a routes table with only one of the conditional name columns', () => {
    const t = fixtureTables(); t['routes.txt']!.columns = t['routes.txt']!.columns.filter((c) => c !== 'route_long_name');
    for (const r of t['routes.txt']!.rows) delete r.route_long_name;
    expect(normalize(t).routes[0]?.shortName).toBe('TEST 1');
  });
  it.each([
    ['missing file', (t: ReturnType<typeof fixtureTables>) => { delete t['trips.txt']; }],
    ['missing column', (t: ReturnType<typeof fixtureTables>) => { t['stops.txt']!.columns = ['stop_id']; }],
    ['duplicate stop', (t: ReturnType<typeof fixtureTables>) => { t['stops.txt']!.rows.push(t['stops.txt']!.rows[0]!); }],
    ['duplicate route', (t: ReturnType<typeof fixtureTables>) => { t['routes.txt']!.rows.push(t['routes.txt']!.rows[0]!); }],
    ['duplicate trip', (t: ReturnType<typeof fixtureTables>) => { t['trips.txt']!.rows.push(t['trips.txt']!.rows[0]!); }],
    ['bad coordinate', (t: ReturnType<typeof fixtureTables>) => { t['stops.txt']!.rows[1]!.stop_lat = 'NaN'; }],
    ['bad type', (t: ReturnType<typeof fixtureTables>) => { t['stops.txt']!.rows[1]!.location_type = '8'; }],
    ['missing parent', (t: ReturnType<typeof fixtureTables>) => { t['stops.txt']!.rows[1]!.parent_station = 'absent'; }],
    ['bad route reference', (t: ReturnType<typeof fixtureTables>) => { t['trips.txt']!.rows[0]!.route_id = 'absent'; }],
    ['bad agency', (t: ReturnType<typeof fixtureTables>) => { t['routes.txt']!.rows[0]!.agency_id = 'absent'; }],
    ['bad route type', (t: ReturnType<typeof fixtureTables>) => { t['routes.txt']!.rows[0]!.route_type = '99'; }],
    ['bad direction', (t: ReturnType<typeof fixtureTables>) => { t['trips.txt']!.rows[0]!.direction_id = '2'; }],
    ['bad service', (t: ReturnType<typeof fixtureTables>) => { t['trips.txt']!.rows[0]!.service_id = 'absent'; }],
    ['bad trip reference', (t: ReturnType<typeof fixtureTables>) => { t['stop_times.txt']!.rows[0]!.trip_id = 'absent'; }],
    ['bad stop reference', (t: ReturnType<typeof fixtureTables>) => { t['stop_times.txt']!.rows[0]!.stop_id = 'station'; }],
    ['duplicate sequence', (t: ReturnType<typeof fixtureTables>) => { t['stop_times.txt']!.rows[1]!.stop_sequence = '1'; }],
    ['backwards time', (t: ReturnType<typeof fixtureTables>) => { t['stop_times.txt']!.rows[1]!.arrival_time = '09:00:00'; }],
    ['bad pickup', (t: ReturnType<typeof fixtureTables>) => { t['stop_times.txt']!.rows[0]!.pickup_type = '4'; }],
    ['bad date', (t: ReturnType<typeof fixtureTables>) => { t['calendar.txt']!.rows[0]!.start_date = '20260230'; }],
    ['bad weekday', (t: ReturnType<typeof fixtureTables>) => { t['calendar.txt']!.rows[0]!.monday = '2'; }],
    ['no calendar', (t: ReturnType<typeof fixtureTables>) => { delete t['calendar.txt']; }],
    ['frequency templates', (t: ReturnType<typeof fixtureTables>) => { t['frequencies.txt'] = { columns: ['trip_id', 'start_time', 'end_time', 'headway_secs'], rows: [{ trip_id: 't1', start_time: '10:00:00', end_time: '12:00:00', headway_secs: '600' }] }; }],
  ])('rejects %s', (_, mutate) => { const t = fixtureTables(); mutate(t); expect(() => normalize(t)).toThrow(); });
  it('does not turn missing times into zero; retains untimed intermediate stops with a warning', () => {
    const t = fixtureTables();
    t['stop_times.txt']!.rows[1]!.stop_sequence = '3';
    t['stop_times.txt']!.rows.push({ trip_id: 't1', stop_id: 's1', stop_sequence: '2', arrival_time: '', departure_time: '', timepoint: '0' });
    const d = normalize(t);
    expect(d.stopTimes.at(-1)?.[4]).toBeNull();
    expect(d.metadata.validation.warnings.join(' ')).toMatch(/Untimed/);
  });
  it('rejects unsupported snapshot versions, count tampering and invalid disk files', () => {
    expect(() => validateDigest({ ...fixtureDigest(), schemaVersion: 2 })).toThrow();
    const d = fixtureDigest(); d.metadata.validation.counts.stops++;
    expect(() => validateDigest(d)).toThrow(/count/);
    expect(loadTransitIndex('/definitely-absent-gtfs-file').reason).toBe('GTFS_UNAVAILABLE');
  });
  it('writes a reloadable snapshot atomically and preserves the last good bytes on failure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gtfs-snapshot-test-')), file = join(dir, 'digest.json');
    try {
      writeTransitDigest(fixtureDigest(), file);
      const previous = readFileSync(file, 'utf8');
      expect(loadTransitIndex(file).index?.digest.metadata.quality).toBe('simulated');
      expect(() => writeTransitDigest({ schemaVersion: 2 }, file)).toThrow();
      expect(readFileSync(file, 'utf8')).toBe(previous);
      writeFileSync(file, '{broken');
      expect(loadTransitIndex(file).reason).toBe('GTFS_INVALID');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('service calendars and GTFS elapsed time', () => {
  const active = createServiceCalendar(fixtureDigest());
  it.each([['wk', '20261116', true], ['wk', '20261114', false], ['sat', '20261114', true], ['sun', '20261115', true], ['sun', '20261114', false], ['wk', '20270101', false]])('service %s on %s = %s', (service, date, expected) => expect(active(service, date)).toBe(expected));
  it('exceptions override base calendars, including calendar-dates-only feeds', () => {
    const d = fixtureDigest();
    d.exceptions = [{ serviceId: 'wk', date: '20261116', type: 2 }, { serviceId: 'wk', date: '20261115', type: 1 }];
    const a = createServiceCalendar(d);
    expect(a('wk', '20261116')).toBe(false); expect(a('wk', '20261115')).toBe(true);
    const t = fixtureTables(); delete t['calendar.txt'];
    t['calendar_dates.txt'] = { columns: ['service_id', 'date', 'exception_type'], rows: ['wk', 'sat', 'sun'].map((service_id) => ({ service_id, date: '20261116', exception_type: '1' })) };
    expect(createServiceCalendar(normalize(t))('wk', '20261116')).toBe(true);
    expect(createServiceCalendar(normalize(t))('wk', '20261117')).toBe(false);
  });
  it.each(['24:60:00', '10:10', '-1:00:00', '168:00:00'])('rejects invalid or unsupported time %s', (time) => expect(() => parseGtfsTime(time)).toThrow());
  it('permits >24h, binds 25:15 to the previous service day', () => {
    expect(parseGtfsTime('25:15:00')).toBe(90900);
    expect(parseGtfsTime('1:05:00')).toBe(3900);
    const result = departuresForStop(new TransitIndex(fixtureDigest()), { stopId: 's1', from: '2026-11-17T00:00:00+02:00', horizonSeconds: 7200 });
    expect(result.departures[0]).toMatchObject({ tripId: 'night', serviceDate: '20261116', scheduledAt: '2026-11-16T23:15:00.000Z' });
  });
  it.each([
    ['20260328', '2026-03-27T22:00:00.000Z'],
    ['20260329', '2026-03-28T21:00:00.000Z'],
    ['20261025', '2026-10-24T22:00:00.000Z'],
    ['20261116', '2026-11-15T22:00:00.000Z'],
  ])('noon minus 12h on %s', (day, expected) => expect(new Date(serviceDayEpoch(day, 'Europe/Bucharest')).toISOString()).toBe(expected));
  it('is independent of the server timezone and crosses civil midnight', () => {
    const old = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Honolulu';
      expect(new Date(serviceDayEpoch('20261116', 'Europe/Bucharest')).toISOString()).toBe('2026-11-15T22:00:00.000Z');
      expect(localServiceDate(Date.parse('2026-11-15T22:01:00Z'), 'Europe/Bucharest')).toBe('20261116');
    } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
  });
  it.each([
    ['2026-03-29T00:00:00Z', '2026-03-29T07:15:00.000Z'],
    ['2026-10-25T00:00:00Z', '2026-10-25T08:15:00.000Z'],
  ])('queries actual service dates on a DST transition %s', (from, expected) => {
    const r = departuresForStop(new TransitIndex(fixtureDigest()), { stopId: 's1', from, horizonSeconds: 43200 });
    expect(r.departures.find((d) => d.tripId === 'sun')?.scheduledAt).toBe(expected);
  });
  it('uses elapsed time at the spring skipped hour and autumn repeated hour', () => {
    expect(new Date(serviceDayEpoch('20260329', 'Europe/Bucharest') + parseGtfsTime('03:30:00') * 1000).toISOString()).toBe('2026-03-29T00:30:00.000Z');
    expect(new Date(serviceDayEpoch('20261025', 'Europe/Bucharest') + parseGtfsTime('03:30:00') * 1000).toISOString()).toBe('2026-10-25T01:30:00.000Z');
  });
});

describe('indexed stop and departure discovery', () => {
  const index = new TransitIndex(fixtureDigest());
  it('preserves stop identities and excludes station/entrance coordinates', () => {
    expect(index.nearby([21.22, 45.75], 1200, 5).map((c) => c.stop.id)).toEqual(['s1', 's2']);
    expect(index.nearby([20, 44], 10, 1)).toEqual([]);
    expect(index.nearby([21.22, 45.75], 1200, 1)).toHaveLength(1);
    expect(() => index.nearby([21.22, 45.75], 1200, 100)).toThrow();
  });
  it('orders departures, uses stop headsign and trip direction, filters route and past times', () => {
    const r = departuresForStop(index, { stopId: 's1', from: '2026-11-16T10:00:00+02:00' });
    expect(r.departures.map((d) => d.tripId)).toEqual(['t1', 't2']);
    expect(r.departures[0]).toMatchObject({ headsign: 'Synthetic platform headsign', directionId: 0, quality: 'simulated' });
    expect(departuresForStop(index, { stopId: 's1', from: '2026-11-16T10:06:00+02:00', directionId: 1 }).departures.map((d) => d.tripId)).toEqual(['t2']);
    expect(departuresForStop(index, { stopId: 's1', from: '2026-11-16T10:00:00+02:00', routeId: 'r2' }).departures).toEqual([]);
  });
  it.each(['1', '2', '3'])('does not offer conditional/no pickup %s', (pickup_type) => {
    const t = fixtureTables(); t['stop_times.txt']!.rows[0]!.pickup_type = pickup_type;
    expect(departuresForStop(new TransitIndex(normalize(t)), { stopId: 's1', from: '2026-11-16T10:00:00+02:00' }).departures.map((d) => d.tripId)).toEqual(['t2']);
  });
  it('supports multiple routes at a stop with stable time ties', () => {
    const d = fixtureDigest(); d.trips[1]!.routeId = 'r2'; d.stopTimes[2]![3] = d.stopTimes[2]![4] = 36300;
    const i = new TransitIndex(d), query = { stopId: 's1', from: '2026-11-16T10:00:00+02:00' };
    expect(departuresForStop(i, query).departures.map((x) => x.routeId)).toEqual(['r1', 'r2']);
    expect(departuresForStop(i, query)).toEqual(departuresForStop(i, query));
  });
  it('returns typed reasons for invalid dates, unsupported coverage and expired feeds', () => {
    expect(departuresForStop(index, { stopId: 's1', from: '2026-11-16' }).reason).toBe('INVALID_INPUT');
    expect(departuresForStop(index, { stopId: 's1', from: '2025-01-01T00:00:00Z' }).reason).toBe('UNSUPPORTED_DATE');
    expect(departuresForStop(index, { stopId: 's1', from: '2027-02-01T00:00:00Z' }).reason).toBe('EXPIRED_FEED');
  });
});
