import type { NeighbourhoodFeature } from './schemas/city';

export type LngLat = [number, number];

/** Distance in metres (equirectangular approximation, accurate enough inside one city). */
export function distanceM(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const x = (b[0] - a[0]) * toRad * Math.cos(((a[1] + b[1]) / 2) * toRad);
  const y = (b[1] - a[1]) * toRad;
  return Math.hypot(x, y) * R;
}

/** Ray casting on one ring of [lng, lat] points. */
export function inRing([x, y]: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside a polygon = inside its outer ring and outside its holes. */
function inPolygon(p: LngLat, rings: LngLat[][]): boolean {
  const [outer, ...holes] = rings;
  return !!outer && inRing(p, outer) && !holes.some((h) => inRing(p, h));
}

export function inNeighbourhood(p: LngLat, f: NeighbourhoodFeature): boolean {
  const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  return polygons.some((rings) => inPolygon(p, rings as LngLat[][]));
}

/** The official neighbourhood (of the City Hall's 40) that contains the point, if any. */
export function neighbourhoodAt(p: LngLat, neighbourhoods: NeighbourhoodFeature[]): NeighbourhoodFeature | null {
  return neighbourhoods.find((f) => inNeighbourhood(p, f)) ?? null;
}

/** The point of a set that is closest to the set's mean: a representative point that lies on the street. */
export function representativePoint(points: LngLat[]): LngLat | null {
  if (points.length === 0) return null;
  const mean: LngLat = [
    points.reduce((s, p) => s + p[0], 0) / points.length,
    points.reduce((s, p) => s + p[1], 0) / points.length,
  ];
  return points.reduce((best, p) => (distanceM(p, mean) < distanceM(best, mean) ? p : best), points[0]!);
}

/** Simple grid index for "nearest named street" lookups (~150 m cells). */
export class StreetIndex {
  private cells = new Map<string, { name: string; point: LngLat }[]>();
  private static CELL = 0.0015; // degrees ≈ 120–170 m in Timișoara

  constructor(streets: { name: string; points: LngLat[] }[]) {
    for (const s of streets) for (const point of s.points) this.cell(point).push({ name: s.name, point });
  }

  private key(p: LngLat, dx = 0, dy = 0) {
    return `${Math.floor(p[0] / StreetIndex.CELL) + dx}:${Math.floor(p[1] / StreetIndex.CELL) + dy}`;
  }

  private cell(p: LngLat) {
    const k = this.key(p);
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = []));
    return c;
  }

  /** Nearest street point within maxM metres, or null. */
  nearest(p: LngLat, maxM: number): { name: string; distanceM: number } | null {
    let best: { name: string; distanceM: number } | null = null;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const e of this.cells.get(this.key(p, dx, dy)) ?? []) {
          const d = distanceM(p, e.point);
          if (d <= maxM && (!best || d < best.distanceM)) best = { name: e.name, distanceM: d };
        }
      }
    }
    return best;
  }
}

/** Mean of a ring's vertices (closing vertex excluded): a centre point for small polygons such as parking lots. */
export function ringCentre(ring: LngLat[]): LngLat {
  const pts = ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

/** Area of a small ring in square metres (shoelace on a local equirectangular projection). */
export function ringAreaM2(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180);
  const k = 6371000 * (Math.PI / 180);
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0] * k * Math.cos(lat0), yi = ring[i]![1] * k;
    const xj = ring[j]![0] * k * Math.cos(lat0), yj = ring[j]![1] * k;
    sum += xj * yi - xi * yj;
  }
  return Math.abs(sum) / 2;
}
