import { BegaRoute, type BegaMode } from '../../../../shared/src/schemas/bega';
import type { Coordinate } from '../../../../shared/src/schemas/navigation';
import type { JourneyOption } from '../../../../shared/src/schemas/journey';

export type BegaRouteProvider = (
  mode: BegaMode, from: Coordinate, to: Coordinate, signal: AbortSignal,
) => Promise<BegaRoute>;

/** Inject the existing activeDirections function; no new HTTP client, credentials or fallback. */
export function adaptActiveDirections(
  active: (mode: BegaMode, from: Coordinate, to: Coordinate) => Promise<JourneyOption>,
): BegaRouteProvider {
  return async (mode, from, to, signal) => {
    signal.throwIfAborted();
    const option = await active(mode, from, to);
    signal.throwIfAborted();
    if (option.mode !== mode) throw new Error('WRONG_ROUTING_MODE');
    return BegaRoute.parse({
      mode, geometry: option.route.geometry,
      distanceMeters: option.route.distance, durationSeconds: option.route.duration,
      source: option.route.source, quality: option.route.quality,
    });
  };
}
