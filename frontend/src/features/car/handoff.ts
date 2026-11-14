import type { Coordinate } from '@vlaiq/shared';

/**
 * Hand-off to a certified navigation app (spec §6.20): VLAIQ FLOW picks the parking, the driver's usual
 * app drives there. Only the parking's coordinates go in the link, never the user's position; the other
 * app asks for its own location permission. The link opens only when the user taps it.
 */
export function externalNavigation([lng, lat]: Coordinate) {
  const ll = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return {
    google: `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: ll, travelmode: 'driving' })}`,
    waze: `https://waze.com/ul?${new URLSearchParams({ ll, navigate: 'yes' })}`,
  };
}
