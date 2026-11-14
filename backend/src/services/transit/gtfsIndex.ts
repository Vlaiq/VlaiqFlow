import { distanceM } from '../../../../shared/src/geo';
import { Coordinate } from '../../../../shared/src/schemas/navigation';
import type { TransitDigest, TransitStop, TransitStopTime } from '../../../../shared/src/schemas/transit';
import { validateDigest } from './gtfsParser';
import { createServiceCalendar } from './gtfsCalendar';

export function lowerBound<T>(list: readonly T[], value: number, key: (x: T) => number) {
  let lo = 0, hi = list.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (key(list[mid]!) < value) lo = mid + 1; else hi = mid; }
  return lo;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
/** Construct once per accepted snapshot. No location cache and no network calls. */
export class TransitIndex {
  readonly digest: TransitDigest;
  readonly stops;
  readonly routes;
  readonly trips;
  readonly active;
  readonly departures: ReadonlyMap<string, readonly TransitStopTime[]>;
  private readonly spatial;
  readonly maxDepartureSeconds: number;
  constructor(input: unknown) {
    const d = this.digest = freeze(validateDigest(input));
    this.stops = new Map(d.stops.map((s) => [s.id, s])) as ReadonlyMap<string, typeof d.stops[number]>;
    this.routes = new Map(d.routes.map((r) => [r.id, r])) as ReadonlyMap<string, typeof d.routes[number]>;
    this.trips = new Map(d.trips.map((t) => [t.id, t])) as ReadonlyMap<string, typeof d.trips[number]>;
    this.active = createServiceCalendar(d);
    const departures = new Map<string, TransitStopTime[]>();
    let max = 0;
    for (const st of d.stopTimes) {
      // Only normal, unconditional pickup at a geographically routable platform.
      if (st[4] === null || st[5] !== 0 || !this.stops.get(st[1])?.coordinate) continue;
      const list = departures.get(st[1]) ?? []; list.push(st); departures.set(st[1], list);
      max = Math.max(max, st[4]);
    }
    for (const list of departures.values()) list.sort((a, b) => a[4]! - b[4]! || a[0].localeCompare(b[0], 'en') || a[2] - b[2]);
    this.departures = departures;
    this.maxDepartureSeconds = max;
    this.spatial = d.stops.filter((s) => s.locationType === 0 && s.coordinate && departures.has(s.id))
      .sort((a, b) => a.coordinate![1] - b.coordinate![1] || a.id.localeCompare(b.id, 'en'));
  }
  /** Geographic screening distance only; never a pedestrian distance/duration. */
  nearby(origin: Coordinate, radiusMeters: number, limit: number) {
    Coordinate.parse(origin);
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 3000 || !Number.isInteger(limit) || limit < 1 || limit > 5)
      throw new Error('Invalid nearby bounds');
    const delta = radiusMeters / 110000;
    const begin = lowerBound(this.spatial, origin[1] - delta, (s) => s.coordinate![1]);
    const candidates: { stop: TransitStop; screeningDistanceMeters: number }[] = [];
    for (let i = begin; i < this.spatial.length && this.spatial[i]!.coordinate![1] <= origin[1] + delta; i++) {
      const stop = this.spatial[i]!, screeningDistanceMeters = distanceM(origin, stop.coordinate!);
      if (screeningDistanceMeters <= radiusMeters) candidates.push({ stop, screeningDistanceMeters });
    }
    return candidates.sort((a, b) => a.screeningDistanceMeters - b.screeningDistanceMeters || a.stop.id.localeCompare(b.stop.id, 'en')).slice(0, limit);
  }
}
