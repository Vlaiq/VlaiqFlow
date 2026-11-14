import { distanceM, type Coordinate, type RecommendationOption } from '@vlaiq/shared';
import type { WalkTime } from './rank';

/**
 * "Parchează o dată" (spec §6.19): one parking for several places reached on foot, in the order given:
 * parking → destination → stop 1 → stop 2 → parking. Deterministic; every leg is a walking time from
 * the walking matrix (or its labelled straight-line estimate).
 */
export type Tour = NonNullable<RecommendationOption['tour']>;

/** Centre of the places, so parkings between them are candidates too. */
export function tourCentre(points: Coordinate[]): Coordinate {
  const n = points.length;
  return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
}

/** Largest distance from the destination to a stop, for the request limit. */
export function tourSpreadM(destination: Coordinate, stops: Coordinate[]): number {
  return Math.max(0, ...stops.map((s) => distanceM(destination, s)));
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const worst = (walks: WalkTime[]): WalkTime['quality'] =>
  walks.some((w) => w.quality === 'unknown') ? 'unknown' : walks.some((w) => w.quality === 'estimated') ? 'estimated' : walks[0]!.quality;

/**
 * The tour for one parking. `walkIn` = parking → destination, `between` = destination → stop 1 → …,
 * `walkOut` = last stop → parking. Only walkIn and walkOut depend on the parking.
 */
export function tourFor(
  names: { parking: string; places: string[] },
  walkIn: WalkTime,
  between: WalkTime[],
  walkOut: WalkTime,
): Tour {
  const all = [walkIn, ...between, walkOut];
  const stops = [names.parking, ...names.places, names.parking];
  return {
    minutes: r1(all.reduce((s, w) => s + w.minutes, 0)),
    meters: Math.round(all.reduce((s, w) => s + w.meters, 0)),
    quality: worst(all),
    source: [...new Set(all.map((w) => w.source))].join('; '),
    legs: all.map((w, i) => ({ from: stops[i]!, to: stops[i + 1]!, minutes: r1(w.minutes), meters: Math.round(w.meters) })),
  };
}

/** What the ranking sees for a tour: the walking that depends on the parking (in + out), both legs within the limit. */
export function rankingWalk(walkIn: WalkTime, walkOut: WalkTime, maxWalkMinutes: number): WalkTime | null {
  if (walkIn.minutes > maxWalkMinutes || walkOut.minutes > maxWalkMinutes) return null;
  return {
    minutes: r1(walkIn.minutes + walkOut.minutes),
    meters: Math.round(walkIn.meters + walkOut.meters),
    quality: worst([walkIn, walkOut]),
    source: walkIn.source,
  };
}
