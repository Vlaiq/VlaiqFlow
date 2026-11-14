import { distanceM } from '../../../../shared/src/geo';

export type Coordinate = [number, number];
export type Bounds = [number, number, number, number];
export interface CorridorLine {
  id: string;
  coordinates: Coordinate[];
  infrastructure: string;
}
export interface OverlapPart {
  /** Clipped provider geometry, never a connector between separate provider lines. */
  coordinates: [Coordinate, Coordinate];
  featureIds: string[];
  infrastructureTypes: string[];
}
export interface CorridorOverlap {
  overlapMeters: number;
  geometryMeters: number;
  parts: OverlapPart[];
  featureIds: string[];
  infrastructureTypes: string[];
}
export interface OverlapOptions {
  toleranceMeters?: number;
  maxHeadingDeviationDegrees?: number;
  maxSegmentComparisons?: number;
}

const RAD = Math.PI / 180;
const METERS_PER_DEGREE = 6371000 * RAD;
const COS_LAT = Math.cos(45.75 * RAD);
const EPSILON = 1e-10;
type XY = [number, number];
type Interval = [number, number];

/** Fixed local equirectangular plane; reject all coordinates outside this city domain.
 * Its east/west scale differs by <0.28% from the shared spherical distance formula
 * over this domain. Lengths use the shared distanceM formula rather than planar lengths.
 * This is a bounded map-matching approximation, not a surveyed infrastructure identity.
 */
export function isLocalCoordinate(point: unknown): point is Coordinate {
  return Array.isArray(point) && point.length === 2 &&
    typeof point[0] === 'number' && typeof point[1] === 'number' &&
    Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
    point[0] >= 21 && point[0] <= 21.5 && point[1] >= 45.6 && point[1] <= 45.9;
}
function project([longitude, latitude]: Coordinate): XY {
  return [(longitude - 21.25) * METERS_PER_DEGREE * COS_LAT,
    (latitude - 45.75) * METERS_PER_DEGREE];
}
function dot(a: XY, b: XY): number { return a[0] * b[0] + a[1] * b[1]; }
function minus(a: XY, b: XY): XY { return [a[0] - b[0], a[1] - b[1]]; }
function interpolate(a: Coordinate, b: Coordinate, fraction: number): Coordinate {
  return [a[0] + fraction * (b[0] - a[0]), a[1] + fraction * (b[1] - a[1])];
}
function validLine(line: Coordinate[]): boolean {
  return line.length >= 2 && line.length <= 20000 && line.every(isLocalCoordinate);
}
export function lineLengthMeters(line: Coordinate[]): number {
  let length = 0;
  for (let i = 1; i < line.length; i++) length += distanceM(line[i - 1]!, line[i]!);
  return length;
}
export function nearestOnLine(point: Coordinate, line: Coordinate[]): {
  point: Coordinate; distanceMeters: number; segmentIndex: number; fraction: number;
} {
  if (!isLocalCoordinate(point) || !validLine(line)) throw new RangeError('INVALID_LOCAL_GEOMETRY');
  const p = project(point);
  let best = { point: line[0]!, distanceMeters: Infinity, segmentIndex: 0, fraction: 0 };
  for (let i = 1; i < line.length; i++) {
    const start = line[i - 1]!;
    const end = line[i]!;
    const a = project(start);
    const d = minus(project(end), a);
    const squared = dot(d, d);
    const fraction = squared === 0 ? 0 : Math.max(0, Math.min(1, dot(minus(p, a), d) / squared));
    const closest = interpolate(start, end, fraction);
    const distanceMeters = distanceM(point, closest);
    if (distanceMeters < best.distanceMeters) best = { point: closest, distanceMeters, segmentIndex: i - 1, fraction };
  }
  return best;
}
export function lineBounds(line: Coordinate[]): Bounds {
  if (line.length === 0) throw new RangeError('EMPTY_GEOMETRY');
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [lng, lat] of line) {
    west = Math.min(west, lng); south = Math.min(south, lat);
    east = Math.max(east, lng); north = Math.max(north, lat);
  }
  return [west, south, east, north];
}
export function boundsIntersect(a: Bounds, b: Bounds, paddingMeters = 0): boolean {
  const latitudePadding = paddingMeters / METERS_PER_DEGREE;
  const longitudePadding = latitudePadding / COS_LAT;
  return a[0] <= b[2] + longitudePadding && a[2] + longitudePadding >= b[0] &&
    a[1] <= b[3] + latitudePadding && a[3] + latitudePadding >= b[1];
}

/** Intersect t in [0,1] with low <= value + slope*t <= high. */
function clipLinear(interval: Interval, value: number, slope: number, low: number, high: number): Interval | null {
  if (Math.abs(slope) < EPSILON) return value >= low && value <= high ? interval : null;
  const t1 = (low - value) / slope, t2 = (high - value) / slope;
  const lo = Math.max(interval[0], Math.min(t1, t2));
  const hi = Math.min(interval[1], Math.max(t1, t2));
  return hi > lo ? [lo, hi] : null;
}
function circleInterval(start: XY, delta: XY, center: XY, radius: number): Interval | null {
  const relative = minus(start, center);
  const quadratic = dot(delta, delta);
  const linear = 2 * dot(relative, delta);
  const constant = dot(relative, relative) - radius * radius;
  const discriminant = linear * linear - 4 * quadratic * constant;
  if (quadratic === 0 || discriminant <= 0) return null;
  const root = Math.sqrt(discriminant);
  const lo = Math.max(0, (-linear - root) / (2 * quadratic));
  const hi = Math.min(1, (-linear + root) / (2 * quadratic));
  return hi > lo ? [lo, hi] : null;
}
/** Exact route-parameter intervals in a finite segment's capsule (strip + endpoint disks). */
function capsuleIntervals(start: XY, delta: XY, a: XY, b: XY, radius: number): Interval[] {
  const axis = minus(b, a);
  const axisLength = Math.hypot(...axis);
  if (axisLength === 0) return [];
  const unit: XY = [axis[0] / axisLength, axis[1] / axisLength];
  const normal: XY = [-unit[1], unit[0]];
  const relative = minus(start, a);
  const longitudinal = clipLinear([0, 1], dot(relative, unit), dot(delta, unit), 0, axisLength);
  const strip = longitudinal && clipLinear(longitudinal, dot(relative, normal), dot(delta, normal), -radius, radius);
  const first = circleInterval(start, delta, a, radius);
  const last = circleInterval(start, delta, b, radius);
  return [strip, first, last].filter((value): value is Interval => value !== null);
}

/** Length-weighted local map matching: intersect each provider segment with capsules
 * around eligible mapped segments, require near-parallel orientation, then union the
 * parameter intervals. Duplicate OSM lines cannot inflate length or corridor share.
 * Perpendicular bridge crossings fail the heading condition. An offset parallel road
 * farther than tolerance is excluded. Distinct parallel infrastructure inside tolerance
 * is fundamentally ambiguous without provider edge IDs; callers must disclose this.
 * Returns null (unknown) on invalid geometry/options or exhausted computational budget.
 */
export function measureCorridorOverlap(
  route: Coordinate[], corridor: CorridorLine[], options: OverlapOptions = {},
): CorridorOverlap | null {
  const tolerance = options.toleranceMeters ?? 6;
  const heading = options.maxHeadingDeviationDegrees ?? 20;
  const budget = options.maxSegmentComparisons ?? 2000000;
  if (!validLine(route) || corridor.length > 2000 ||
      !Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 15 ||
      !Number.isFinite(heading) || heading < 0 || heading > 45 ||
      !Number.isSafeInteger(budget) || budget < 1 || budget > 10000000) return null;
  const segments: { a: XY; b: XY; delta: XY; length: number; id: string; infrastructure: string }[] = [];
  for (const feature of corridor) {
    if (!feature.id || !feature.infrastructure || !validLine(feature.coordinates)) return null;
    for (let i = 1; i < feature.coordinates.length; i++) {
      if (segments.length >= 50000) return null;
      const a = project(feature.coordinates[i - 1]!), b = project(feature.coordinates[i]!);
      const delta = minus(b, a), length = Math.hypot(...delta);
      if (length > EPSILON) segments.push({ a, b, delta, length, id: feature.id, infrastructure: feature.infrastructure });
    }
  }
  const parts: OverlapPart[] = [];
  const featureIds = new Set<string>(), infrastructureTypes = new Set<string>();
  let overlapMeters = 0, comparisons = 0, sweepReferences = 0;
  const minCosine = Math.cos(heading * RAD);
  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1]!, to = route[i]!;
    const start = project(from), delta = minus(project(to), start);
    const projectedLength = Math.hypot(...delta);
    if (projectedLength <= EPSILON) continue;
    const hits: { range: Interval; id: string; infrastructure: string }[] = [];
    for (const segment of segments) {
      if (++comparisons > budget) return null;
      if (Math.abs(dot(delta, segment.delta)) / (projectedLength * segment.length) + EPSILON < minCosine) continue;
      if (Math.min(start[0], start[0] + delta[0]) > Math.max(segment.a[0], segment.b[0]) + tolerance ||
          Math.max(start[0], start[0] + delta[0]) + tolerance < Math.min(segment.a[0], segment.b[0]) ||
          Math.min(start[1], start[1] + delta[1]) > Math.max(segment.a[1], segment.b[1]) + tolerance ||
          Math.max(start[1], start[1] + delta[1]) + tolerance < Math.min(segment.a[1], segment.b[1])) continue;
      for (const range of capsuleIntervals(start, delta, segment.a, segment.b, tolerance)) {
        hits.push({ range, id: segment.id, infrastructure: segment.infrastructure });
      }
    }
    // Sweep every interval boundary. Active references identify only geometry that
    // actually contributes to this clipped part, not every feature near the whole route.
    const events = hits.flatMap((hit, index) => [
      { t: hit.range[0], index, enter: true }, { t: hit.range[1], index, enter: false },
    ]).sort((a, b) => a.t - b.t || Number(a.enter) - Number(b.enter) || a.index - b.index);
    const active = new Set<number>();
    let previous = 0;
    const routeLength = distanceM(from, to);
    for (let cursor = 0; cursor < events.length;) {
      const t = events[cursor]!.t;
      if (active.size > 0 && t - previous > EPSILON) {
        const ids = new Set<string>(), types = new Set<string>();
        for (const index of active) {
          // Interval-reference attribution also has a work budget: adversarial
          // overlapping inputs must not turn the sweep into an unbounded cross-product.
          if (++sweepReferences > budget) return null;
          const hit = hits[index]!;
          ids.add(hit.id); types.add(hit.infrastructure);
          featureIds.add(hit.id); infrastructureTypes.add(hit.infrastructure);
        }
        overlapMeters += routeLength * (t - previous);
        parts.push({ coordinates: [interpolate(from, to, previous), interpolate(from, to, t)],
          featureIds: [...ids].sort(), infrastructureTypes: [...types].sort() });
        if (parts.length > 50000) return null;
      }
      while (cursor < events.length && events[cursor]!.t === t) {
        const event = events[cursor++]!;
        if (event.enter) active.add(event.index); else active.delete(event.index);
      }
      previous = t;
    }
  }
  return { overlapMeters, geometryMeters: lineLengthMeters(route), parts,
    featureIds: [...featureIds].sort(), infrastructureTypes: [...infrastructureTypes].sort() };
}
