import { beforeAll, describe, expect, it } from 'vitest';
import { TransitArchiveProvenance, BioPacerResult } from '../../../../shared/src/schemas/transit';
import { loadTransitIndex } from './transitData';
import { departuresForStop } from './departures';
import type { TransitIndex } from './gtfsIndex';
import { calculateBioPacer } from './bioPacer';

describe('committed real SMTT 4.32 snapshot (no network requests)', () => {
  let index: TransitIndex;
  beforeAll(() => { const loaded = loadTransitIndex(); if (!loaded.index) throw new Error(loaded.reason); index = loaded.index; });
  it('retains the verified archive identity, publisher and unknown original download time', () => {
    expect(index.digest.metadata).toMatchObject({
      fetchedAt: null, acquisition: 'user_supplied_archive', version: '4.32', validFrom: '20261116', validUntil: '20261231',
      timezone: 'Europe/Bucharest', archiveBytes: 1822565,
      sha256: '1f9cfe12ed2b51872dc0c5008387a488eaeec2c88e0b91bd456917e8942fa278',
      publisher: { name: 'SMTT', url: 'https://smtt.ro' },
      validation: { counts: { stops: 889, routes: 58, trips: 13335, stopTimes: 203761 } },
    });
    expect(index.digest.calendars).toHaveLength(151); expect(index.digest.exceptions).toHaveLength(1095);
    expect(index.stops.get('85')).toMatchObject({ name: 'Catedrala Mitropolitană', coordinate: [21.22364, 45.75113], wheelchairBoarding: null });
    expect(index.digest.metadata.attributions?.[0]?.isAuthority).toBe(true);
  });
  it('returns original trip/route/stop times and flags approximate published timepoints', () => {
    const result = departuresForStop(index, { stopId: '85', from: '2026-11-16T08:00:00+02:00', limit: 3 });
    expect(result.departures.map((d) => [d.tripId, d.routeId, d.scheduledAt])).toEqual([
      ['7.1_WDSC_T_01_03', 'R_TV_7', '2026-11-16T06:08:00.000Z'],
      ['4.1_WDSC_R_02_02', 'R_TV_4', '2026-11-16T06:12:00.000Z'],
      ['2.1_WDSC_T_05_03', 'R_TV_2', '2026-11-16T06:14:00.000Z'],
    ]);
    expect(result.departures[0]).toMatchObject({ directionId: 0, serviceDate: '20261116', timepoint: 0, headsign: 'Calea Torontalului (Ciocanul)' });
  });
  it('respects actual weekends, holiday exceptions and exception-only vacation services', () => {
    expect(index.active('S_TV_7_WDSC', '20261116')).toBe(true);
    expect(index.active('S_TV_7_WESB', '20261121')).toBe(true);
    expect(index.active('S_TV_7_WEDU', '20261122')).toBe(true);
    expect(index.active('S_TV_7_WDSC', '20261130')).toBe(false);
    expect(index.active('S_TV_7_WEDU', '20261130')).toBe(true);
    expect(index.active('S_TV_7_WDVC', '20261223')).toBe(true);
    expect(departuresForStop(index, { stopId: '85', from: '2026-11-30T08:00:00+02:00' }).departures.every((d) => !d.serviceId.endsWith('_WDSC'))).toBe(true);
  });
  it('binds a real 24:00 departure to the previous valid service date', () => {
    const r = departuresForStop(index, { stopId: '108', from: '2026-11-16T23:59:00+02:00', horizonSeconds: 120 });
    expect(r.departures).toContainEqual(expect.objectContaining({ tripId: '5c.1_WDSC_T_01_14', serviceDate: '20261116', departureSeconds: 86400, scheduledAt: '2026-11-16T22:00:00.000Z' }));
  });
  it('excludes passed departures, is stable, and does not invent demonstration-weekend coverage', () => {
    const q = { stopId: '85', from: '2026-11-16T08:09:00+02:00' };
    const a = departuresForStop(index, q); expect(a).toEqual(departuresForStop(index, q));
    expect(a.departures[0]?.scheduledAt).toBe('2026-11-16T06:12:00.000Z');
    expect(departuresForStop(index, { stopId: '85', from: '2026-11-14T08:00:00+02:00' })).toEqual({ departures: [], reason: 'UNSUPPORTED_DATE' });
    expect(departuresForStop(index, { stopId: '85', from: '2027-01-08T08:00:00+02:00' }).reason).toBe('EXPIRED_FEED');
  });
  it('returns real scheduled options with UNKNOWN access when the walking provider is absent', async () => {
    const result = await calculateBioPacer({ origin: index.stops.get('91')!.coordinate, stopId: '85', startAt: '2026-11-16T08:00:00+02:00' }, index, async () => null,
      { now: () => new Date('2026-11-14T18:00:00Z') });
    expect(BioPacerResult.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({ status: 'unavailable', reason: 'WALKING_UNAVAILABLE', recommendation: 'NONE', recommendedDepartureId: null });
    expect(result.options.length).toBeGreaterThan(0);
    expect(result.options.every((o) => o.category === 'UNKNOWN' && o.walking === null && o.departure.quality === 'confirmed')).toBe(true);
  });
});
it('rejects forged/unknown acquisition modes, unsupported sources and missing publisher retrieval times', () => {
  const p = { source: 'https://smtt.ro/transit/gtfs/maps/smtt-timisoara-ro.zip', fetchedAt: null,
    acquisition: 'user_supplied_archive', sha256: 'a'.repeat(64), archiveBytes: 123 };
  expect(TransitArchiveProvenance.safeParse(p).success).toBe(true);
  expect(TransitArchiveProvenance.safeParse({ ...p, acquisition: 'publisher_download' }).success).toBe(false);
  expect(TransitArchiveProvenance.safeParse({ ...p, acquisition: 'anything' }).success).toBe(false);
  expect(TransitArchiveProvenance.safeParse({ ...p, source: 'https://example.test/untrusted.zip' }).success).toBe(false);
  expect(TransitArchiveProvenance.safeParse({ ...p, quality: 'confirmed' }).success).toBe(false);
});
