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

// Synthetic fixtures: coordinates are mathematical test points, not surveyed school entrances.
const centre: LngLat = [21.23, 45.75];
const north = (metres: number): LngLat => [centre[0], centre[1] + metres / (6371000 * Math.PI / 180)];
const fixtureSchool = (id: string, point: LngLat = centre) => ({
  id, name: 'Instituție de test', kind: 'school' as const, lng: point[0], lat: point[1],
});

describe('school selection and boundary integrity', () => {
  it('includes the 150 m trigger boundary and rejects points immediately beyond it', () => {
    for (const metres of [0, 149.99, 150, 150.01]) {
      const point = north(metres);
      expect(distanceM(centre, point)).toBeCloseTo(metres, 6);
      expect(schoolsNear(centre, [fixtureSchool('osm-way-1', point)])).toHaveLength(metres <= 150 ? 1 : 0);
    }
    expect(schoolsNear(centre, [])).toEqual([]);
  });

  it('deduplicates IDs before the four-school cap and is stable under input permutation', () => {
    const all = [6, 5, 4, 3, 2, 1].map((n) => fixtureSchool(`osm-way-${n}`));
    all.push(all[5]!, { ...all[5]!, name: 'Z duplicate test name' });
    const select = (items: typeof all) => schoolsNear(centre, items).map(({ school }) => school);
    expect(select(all).map((s) => s.id)).toEqual(['osm-way-1', 'osm-way-2', 'osm-way-3', 'osm-way-4']);
    expect(select([...all].reverse())).toEqual(select(all));
    // Different OSM IDs may be different institutions at the same position. Do not guess a merge.
    expect(schoolsNear(centre, all.slice(0, 2))).toHaveLength(2);
    expect(schoolsNear(centre, [fixtureSchool('osm-node-1', north(100)), fixtureSchool('osm-way-2', north(20))])[0]?.school.id).toBe('osm-way-2');
  });

  it('rejects malformed OSM identifiers and nonfinite/out-of-range coordinates before selection', () => {
    const invalidPoints: LngLat[] = [[NaN, 45], [21, Infinity], [181, 45], [21, 91], [-181, 45], [21, -91]];
    for (const p of invalidPoints) {
      expect(schoolsNear(p, [fixtureSchool('osm-node-1')])).toEqual([]);
      expect(schoolsNear(centre, [fixtureSchool('osm-node-1', p)])).toEqual([]);
    }
    for (const id of ['', 'osm-node-0', 'osm-way--1', 'osm-node-01', 'osm-relation-2/evil', 'poi-1']) {
      expect(osmUrlOf(id)).toBeNull();
      expect(schoolsNear(centre, [fixtureSchool(id)])).toEqual([]);
    }
    expect(osmUrlOf('osm-relation-3')).toBe('https://www.openstreetmap.org/relation/3');
    expect(osmUrlOf('osm-way-12')).toBe('https://www.openstreetmap.org/way/12');
  });

  it('excludes the strict interior only, retaining the 250 m boundary', () => {
    const zone = { radiusM: 250, schools: [{ coordinate: centre }] } as Parameters<typeof insideZone>[1];
    for (const metres of [0, 249.99, 250, 250.01]) {
      expect(insideZone(north(metres), zone)).toBe(metres < 250);
    }
    expect(insideZone([NaN, 45], zone)).toBe(false);
    expect(insideZone(centre, { ...zone, radiusM: NaN })).toBe(false);
  });

  it('rejects degenerate rings and preserves longitude/latitude adjustment at city latitudes', () => {
    for (const [point, radius, steps] of [
      [centre, 0, 32], [centre, -250, 32], [centre, Infinity, 32], [centre, 250, 0],
      [centre, 250, 2], [centre, 250, 3.5], [[21, NaN], 250, 32], [[21, 90], 250, 32],
    ] as [LngLat, number, number][]) expect(circleRing(point, radius, steps)).toEqual([]);
    const ring = circleRing(centre, 250);
    expect(ring).toHaveLength(33);
    for (const p of ring) expect(distanceM(centre, p)).toBeCloseTo(250, -1);
    expect(ring[0]![0] - centre[0]).toBeGreaterThan(ring[8]![1] - centre[1]);
  });

  it('measures union overlap once, is direction/segmentation consistent, and handles zero-length routes', () => {
    const circle = { center: centre, radiusM: 250 };
    const line: LngLat[] = [north(-500), north(500)];
    const measured = metresInside(line, [circle]);
    expect(measured).toBeCloseTo(500, -1); // 10 m midpoint sampling, not survey precision
    expect(metresInside(line, [circle, circle])).toBe(measured);
    expect(Math.abs(metresInside(line, [circle, { center: north(200), radiusM: 250 }]) - 700)).toBeLessThanOrEqual(10);
    expect(metresInside([...line].reverse(), [circle])).toBe(measured);
    expect(Math.abs(metresInside([line[0]!, centre, line[1]!], [circle]) - measured)).toBeLessThanOrEqual(10);
    expect(metresInside([], [circle])).toBe(0);
    expect(metresInside([centre], [circle])).toBe(0);
    expect(metresInside([centre, centre], [circle])).toBe(0);
    expect(metresInside(line, [])).toBe(0);
  });
});
