import { distanceM, type Coordinate } from '@vlaiq/shared';

/** Provider snapping tolerance, shared by navigation, comparisons and complete journeys. */
export function validateEndpoints(geometry: Coordinate[], from: Coordinate, to: Coordinate) {
  if (
    geometry.length < 2 ||
    !Number.isFinite(distanceM(geometry[0]!, from)) ||
    !Number.isFinite(distanceM(geometry.at(-1)!, to)) ||
    distanceM(geometry[0]!, from) > 250 ||
    distanceM(geometry.at(-1)!, to) > 250
  )
    throw new Error('ROUTE_ENDPOINT_MISMATCH');
}
