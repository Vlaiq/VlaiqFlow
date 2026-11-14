import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { distanceM, type LngLat } from './geo';
import { circleRing, insideZone, metresInside, osmUrlOf, schoolsNear, schoolWindowAt } from './protectedZones';
import { OsmSchoolsSnapshot } from './schemas/city';

describe('protected zone geometry', () => {
  it('draws a closed ring at the requested radius', () => {
    const ring = circleRing([21.23, 45.75], 250, 16);
    expect(ring).toHaveLength(17);
    expect(ring[0]).toEqual(ring.at(-1));
    for (const p of ring) expect(Math.abs(distanceM(p, [21.23, 45.75]) - 250)).toBeLessThan(3);
  });

  it('measures how much of a route runs inside the zone', () => {
    const circle = { center: [21.23, 45.75] as LngLat, radiusM: 250 };
    // A straight test line through the centre, 1 km long: about 500 m inside.
    const line: LngLat[] = [
      [21.2236, 45.75],
      [21.2364, 45.75],
    ];
    expect(metresInside(line, [circle])).toBeGreaterThan(480);
    expect(metresInside(line, [circle])).toBeLessThan(520);
    expect(metresInside([[21.2, 45.74], [21.21, 45.74]], [circle])).toBe(0);
    expect(insideZone([21.2301, 45.7501], { radiusM: 250, schools: [{ coordinate: [21.23, 45.75] }] as never })).toBe(true);
  });

  it('uses local school windows with an exclusive end', () => {
    const at = (hour: number, minute: number) => schoolWindowAt({ day: 'weekday', hour, minute, holiday: null }).window;
    expect(at(7, 29)).toBeNull();
    expect(at(7, 30)?.start).toBe('07:30');
    expect(at(8, 30)).toBeNull();
    expect(schoolWindowAt({ day: 'saturday', hour: 8, minute: 0, holiday: null }).window).toBeNull();
  });

  it('builds OSM links only from our own ids', () => {
    expect(osmUrlOf('osm-node-42')).toBe('https://www.openstreetmap.org/node/42');
    expect(osmUrlOf('poi-3')).toBeNull();
  });
});

describe('schools snapshot', () => {
  const file = fileURLToPath(new URL('./data/schools.osm.json', import.meta.url));
  const snapshot = OsmSchoolsSnapshot.parse(JSON.parse(readFileSync(file, 'utf8')));

  it('is OpenStreetMap data inside Timișoara, in [lng, lat] order once mapped', () => {
    expect(snapshot.attribution).toMatch(/OpenStreetMap/);
    expect(snapshot.data.schools.length).toBeGreaterThan(50);
    for (const s of snapshot.data.schools) {
      expect(s.lat).toBeGreaterThan(45.7);
      expect(s.lat).toBeLessThan(45.81);
      expect(s.lng).toBeGreaterThan(21.15);
      expect(s.lng).toBeLessThan(21.31);
    }
  });

  it('finds the C. D. Loga national college next to its own position', () => {
    const loga = snapshot.data.schools.find((s) => /Diaconovici Loga/.test(s.name ?? ''));
    expect(loga).toBeDefined();
    const near = schoolsNear([loga!.lng, loga!.lat], snapshot.data.schools);
    expect(near[0]?.school.id).toBe(loga!.id);
  });
});
