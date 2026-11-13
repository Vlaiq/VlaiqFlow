import { z } from 'zod';
import snapshot from './data/timis-county.json';

const Position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const Ring = z
  .array(Position)
  .min(4)
  .refine((points) => {
    const first = points[0]!,
      last = points.at(-1)!;
    return first[0] === last[0] && first[1] === last[1];
  }, 'County polygon rings must be closed');
const Snapshot = z.object({
  type: z.literal('Feature'),
  properties: z.object({
    name: z.string(),
    name_alt: z.string(),
    iso_3166_2: z.literal('RO-TM'),
    adm1_code: z.literal('ROU-280'),
    type_en: z.literal('County'),
    admin: z.literal('Romania'),
    wikidataid: z.literal('Q185586'),
    source: z.string(),
    license: z.literal('Public domain'),
    sourceUrl: z.string().url(),
    licenseUrl: z.string().url(),
    snapshotDate: z.string(),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    quality: z.literal('estimated'),
    precision: z.string(),
  }),
  geometry: z.object({ type: z.literal('Polygon'), coordinates: z.array(Ring).min(1) }),
});

/** Verified source feature, selected by ISO 3166-2 metadata rather than guessed name. */
export const TIMIS_COUNTY = Snapshot.parse(snapshot);
export type CountyCoordinate = [number, number];
const allPoints = TIMIS_COUNTY.geometry.coordinates.flat();
export const TIMIS_COUNTY_BOUNDS: [CountyCoordinate, CountyCoordinate] = [
  [Math.min(...allPoints.map((p) => p[0])), Math.min(...allPoints.map((p) => p[1]))],
  [Math.max(...allPoints.map((p) => p[0])), Math.max(...allPoints.map((p) => p[1]))],
];

function inRing(point: CountyCoordinate, ring: CountyCoordinate[]): boolean {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!,
      [xj, yj] = ring[j]!;
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    if (
      Math.abs(cross) < 1e-10 &&
      x >= Math.min(xi, xj) &&
      x <= Math.max(xi, xj) &&
      y >= Math.min(yi, yj) &&
      y <= Math.max(yi, yj)
    )
      return true;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Cartographic scope check. Boundary is generalized, not a cadastral eligibility decision. */
export function isInTimisCounty(point: CountyCoordinate): boolean {
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return false;
  const [[west, south], [east, north]] = TIMIS_COUNTY_BOUNDS;
  if (point[0] < west || point[0] > east || point[1] < south || point[1] > north) return false;
  const [outer, ...holes] = TIMIS_COUNTY.geometry.coordinates;
  return inRing(point, outer!) && !holes.some((hole) => inRing(point, hole));
}
