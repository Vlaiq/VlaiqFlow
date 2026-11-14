import { describe, expect, it } from 'vitest';
import { distanceM, schoolStreetProposal, type Coordinate, type OsmSchool } from '@vlaiq/shared';
import { applySchoolZone, schoolZone } from './schoolZone';
import { usableAvoid } from '../../services/routing';

// Timișoara is UTC+2 in November: 07:45 local = 05:45Z.
const school: OsmSchool = { id: 'osm-way-1', name: 'Școala Gimnazială Test', kind: 'school', lat: 45.75, lng: 21.23 };
const atSchool: Coordinate = [21.2305, 45.7502]; // ~45 m from the school
const far: Coordinate = [21.25, 45.76]; // ~2 km away

const zoneAt = (iso: string, mode: 'auto' | 'off' = 'auto', destination = atSchool) =>
  schoolZone({ destination, at: new Date(iso), mode, schools: [school] });

describe('school zone (spec §6.16)', () => {
  it('opens only when a school is within 150 m of the destination', () => {
    expect(zoneAt('2026-11-16T05:45:00Z', 'auto', far)).toBeNull();
    const zone = zoneAt('2026-11-16T05:45:00Z');
    expect(zone?.schools[0]?.id).toBe('osm-way-1');
    expect(zone?.schools[0]?.osmUrl).toBe('https://www.openstreetmap.org/way/1');
  });

  it('is active inside the school windows on a weekday, local time', () => {
    // Monday 16 Nov 2026
    expect(zoneAt('2026-11-16T05:45:00Z')).toMatchObject({ active: true, applied: true, window: { start: '07:30', end: '08:30' } });
    expect(zoneAt('2026-11-16T11:00:00Z')?.window).toEqual({ start: '12:00', end: '14:00' }); // 13:00 local
    expect(zoneAt('2026-11-16T15:29:00Z')?.window).toEqual({ start: '16:00', end: '17:30' }); // 17:29 local
    expect(zoneAt('2026-11-16T15:30:00Z')?.active).toBe(false); // 17:30 local: end is exclusive
    expect(zoneAt('2026-11-16T08:00:00Z')).toMatchObject({ active: false, applied: false }); // 10:00 local
  });

  it('is off at weekends and on public holidays', () => {
    expect(zoneAt('2026-11-14T05:45:00Z')?.inactiveReason).toMatch(/weekend/); // Saturday
    expect(zoneAt('2026-11-30T05:45:00Z')?.inactiveReason).toMatch(/Sf\. Andrei/); // Monday, holiday
  });

  it('respects the opt-out for this trip', () => {
    expect(zoneAt('2026-11-16T05:45:00Z', 'off')).toMatchObject({ active: true, optedOut: true, applied: false });
  });

  it('leaves out the parkings inside the zone only when applied, and counts them', () => {
    const near = { id: 'near', coordinate: [21.2302, 45.7501] as Coordinate }; // ~20 m
    const outside = { id: 'out', coordinate: [21.2345, 45.7501] as Coordinate }; // ~350 m
    expect(distanceM(outside.coordinate, [school.lng, school.lat])).toBeGreaterThan(250);
    const applied = applySchoolZone([near, outside], zoneAt('2026-11-16T05:45:00Z'));
    expect(applied.kept.map((c) => c.id)).toEqual(['out']);
    expect(applied.zone).toMatchObject({ insideZone: 1, excluded: 1 });
    const inactive = applySchoolZone([near, outside], zoneAt('2026-11-16T08:00:00Z'));
    expect(inactive.kept.map((c) => c.id)).toEqual(['near', 'out']);
    expect(inactive.zone).toMatchObject({ insideZone: 1, excluded: 0 });
    expect(applySchoolZone([near], null)).toEqual({ kept: [near], zone: null });
  });

  it('writes the Decidem proposal only from zone data', () => {
    const { zone } = applySchoolZone([{ coordinate: [21.2302, 45.7501] as Coordinate }], zoneAt('2026-11-16T05:45:00Z'));
    const text = schoolStreetProposal(zone!);
    expect(text.title).toBe('Stradă școlară la Școala Gimnazială Test');
    expect(text.body).toContain('07:30–08:30, 12:00–14:00, 16:00–17:30');
    expect(text.body).toContain('1 parcare candidată');
    expect(text.body).toContain('a fost exclusă 1 parcare');
    expect(text.body).toContain('aplicația nu a trimis nimic');
  });
});

describe('route avoidance', () => {
  it('drops a circle that contains the start or the end', () => {
    const circle = { center: [21.23, 45.75] as Coordinate, radiusM: 250 };
    expect(usableAvoid([21.2302, 45.7501], [21.3, 45.8], [circle])).toEqual([]);
    expect(usableAvoid([21.2, 45.74], [21.3, 45.8], [circle])).toEqual([circle]);
  });
});

// All coordinates and institution names below are synthetic test fixtures.
describe('School Shield temporal and candidate regressions', () => {
  it.each([
    ['2026-11-16T05:29:59Z', false], // Monday 07:29:59 Bucharest
    ['2026-11-16T05:30:00Z', true],
    ['2026-11-16T06:29:59Z', true],
    ['2026-11-16T06:30:00Z', false],
    ['2026-11-16T10:00:00Z', true], // 12:00
    ['2026-11-16T12:00:00Z', false], // 14:00
    ['2026-11-16T14:00:00Z', true], // 16:00
    ['2026-11-16T15:30:00Z', false], // 17:30
    ['2026-11-20T05:45:00Z', true], // Friday
    ['2026-11-14T05:45:00Z', false], // Saturday
    ['2026-11-15T05:45:00Z', false], // Sunday
    ['2026-11-30T05:45:00Z', false], // fixed public holiday
    ['2026-04-10T04:45:00Z', false], // Orthodox Good Friday
    ['2026-04-13T04:45:00Z', false], // Orthodox Easter Monday
    ['2026-06-01T04:45:00Z', false], // Children’s Day / Pentecost Monday
    ['2026-03-27T05:45:00Z', true], // Friday before spring DST
    ['2026-03-30T04:45:00Z', true], // Monday after spring DST
    ['2026-10-23T04:45:00Z', true], // Friday before autumn DST
    ['2026-10-26T05:45:00Z', true], // Monday after autumn DST
    ['2026-03-29T00:59:00Z', false], // transition Sunday before clock change
    ['2026-03-29T01:00:00Z', false],
    ['2026-10-25T00:59:00Z', false],
    ['2026-10-25T01:00:00Z', false],
  ])('interprets %s in Europe/Bucharest, active=%s', (iso, active) => {
    expect(zoneAt(iso)).toMatchObject({ active, applied: active, optedOut: false });
  });

  it('treats equivalent instants with different explicit offsets identically', () => {
    const utc = zoneAt('2026-11-16T05:45:00Z');
    expect(zoneAt('2026-11-16T07:45:00+02:00')).toEqual(utc);
    expect(zoneAt('2026-11-16T00:45:00-05:00')).toEqual(utc);
    expect(zoneAt('2026-03-30T07:45:00+03:00')).toMatchObject({ active: true });
  });

  it('does not claim a school vacation calendar and keeps its limitation visible', () => {
    const zone = zoneAt('2026-07-20T04:45:00Z')!;
    expect(zone.active).toBe(true); // configured weekday window, not evidence of teaching activity
    expect(zone.note).toMatch(/Vacanțele școlare nu sunt incluse/);
    expect(zone.quality).toBe('estimated');
    expect(zone.source).toContain('OpenStreetMap');
    expect(zone.note).toContain('nu restricție oficială');
  });

  it('rejects an invalid Date rather than interpreting the machine clock', () => {
    expect(() => zoneAt('not-a-date')).toThrow(RangeError);
  });

  it('counts a candidate in overlapping circles once and preserves candidate order without mutating input', () => {
    const zone = schoolZone({ destination: atSchool, at: new Date('2026-11-16T05:45Z'), mode: 'auto', schools: [
      school, { ...school, id: 'osm-way-2', lng: school.lng + 0.0001 },
    ] })!;
    const inside = { id: 'inside', coordinate: [school.lng, school.lat] as Coordinate };
    const outside = { id: 'outside', coordinate: far };
    const candidates = [outside, inside];
    expect(applySchoolZone(candidates, zone)).toMatchObject({ kept: [outside], zone: { insideZone: 1, excluded: 1 } });
    expect(zone.excluded).toBe(0);
    expect(candidates).toEqual([outside, inside]);
    expect(applySchoolZone([inside], zone)).toMatchObject({ kept: [], zone: { insideZone: 1, excluded: 1 } });
    expect(applySchoolZone([], zone)).toMatchObject({ kept: [], zone: { insideZone: 0, excluded: 0 } });
    expect(applySchoolZone([outside], zone)).toMatchObject({ kept: [outside], zone: { insideZone: 0, excluded: 0 } });
  });

  it('keeps every candidate when inactive or opted out, then filters after re-enabling', () => {
    const candidate = { coordinate: [school.lng, school.lat] as Coordinate };
    for (const zone of [zoneAt('2026-11-16T08:00Z'), zoneAt('2026-11-16T05:45Z', 'off')]) {
      expect(applySchoolZone([candidate], zone)).toMatchObject({ kept: [candidate], zone: { excluded: 0, insideZone: 1 } });
    }
    expect(applySchoolZone([candidate], zoneAt('2026-11-16T05:45Z', 'auto'))).toMatchObject({ kept: [], zone: { excluded: 1 } });
  });

  it('uses the nearest OSM street as an unverified hint in a deterministic civic draft', async () => {
    const { StreetIndex } = await import('@vlaiq/shared');
    const zone = schoolZone({ destination: atSchool, at: new Date('2026-11-16T05:45Z'), mode: 'off', schools: [school],
      streets: new StreetIndex([{ name: 'Strada de test', points: [[school.lng, school.lat]] }]),
    })!;
    const counted = applySchoolZone([{ coordinate: [school.lng, school.lat] as Coordinate }], zone).zone!;
    const proposal = schoolStreetProposal(counted);
    expect(proposal).toEqual(schoolStreetProposal(counted));
    expect(proposal.body).toContain('Reper geografic: Strada de test');
    expect(proposal.body).toContain('nu o intrare sau adresă verificată');
    expect(proposal.body).toContain('au fost excluse 0 parcări');
    expect(proposal.body).toContain('Autoritățile competente ar putea analiza');
    expect(proposal.body).toContain('fără aprobare oficială');
    expect(proposal.body).not.toMatch(/pot opri la|3–4 minute|1 parcări|semnături/);
    expect(schoolStreetProposal({ ...counted, insideZone: 2, excluded: 2 }).body).toContain('2 parcări candidate');
    expect(schoolStreetProposal({ ...counted, insideZone: 20, excluded: 20 }).body).toContain('20 de parcări');
  });
});
