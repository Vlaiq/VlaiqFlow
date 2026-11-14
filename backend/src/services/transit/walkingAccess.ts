import { activeDirections } from '../activeRouting';
import { WalkingAccess } from '../../../../shared/src/schemas/transit';
import type { WalkingDependency } from './bioPacer';

/** Reuse the approved provider, profile, cache and queue. No new provider or credential flow. */
export const existingWalkingAccess: WalkingDependency = async (from, to, signal) => {
  signal.throwIfAborted();
  const option = await activeDirections('walk', from, to);
  signal.throwIfAborted();
  if (option.mode !== 'walk') throw new Error('INVALID_WALKING_MODE');
  return WalkingAccess.parse({
    mode: 'walk', profile: 'foot-walking', from, to, geometry: option.route.geometry,
    distanceMeters: option.route.distance, durationSeconds: option.route.duration,
    source: option.route.source, quality: option.route.quality, calculatedAt: new Date().toISOString(),
  });
};
