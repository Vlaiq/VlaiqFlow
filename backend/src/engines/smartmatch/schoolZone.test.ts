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
    expect(text.body).toContain('1 parcări cunoscute');
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
