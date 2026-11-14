// Synthetic fixtures for tests only. Never loaded as a production fallback.
import { normalizeGtfs, type GtfsTables } from './gtfsParser';
import type { WalkingAccess } from '../../../../shared/src/schemas/transit';

export function fixtureTables(): GtfsTables {
  const table = (columns: string[], rows: string[][]) => ({ columns, rows: rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? '']))) });
  return {
    'agency.txt': table(['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], [['a', 'SYNTHETIC TEST AGENCY', 'https://example.test', 'Europe/Bucharest']]),
    'stops.txt': table(['stop_id', 'stop_name', 'stop_lon', 'stop_lat', 'location_type', 'parent_station'], [
      ['station', 'Synthetic station', '21.220', '45.750', '1'],
      ['s1', 'Same synthetic name', '21.221', '45.751', '0', 'station'],
      ['s2', 'Same synthetic name', '21.222', '45.752', '0', 'station'],
      ['entrance', 'Synthetic entrance', '21.220', '45.750', '2', 'station'],
    ]),
    'routes.txt': table(['route_id', 'agency_id', 'route_short_name', 'route_long_name', 'route_type'], [
      ['r1', 'a', 'TEST 1', '', '0'], ['r2', 'a', 'TEST 2', '', '3'],
    ]),
    'trips.txt': table(['trip_id', 'route_id', 'service_id', 'trip_headsign', 'direction_id'], [
      ['t1', 'r1', 'wk', 'Synthetic East', '0'], ['t2', 'r1', 'wk', 'Synthetic West', '1'],
      ['sat', 'r2', 'sat', 'Synthetic Saturday', '0'], ['sun', 'r2', 'sun', 'Synthetic Sunday', '1'],
      ['night', 'r2', 'wk', 'Synthetic night', '1'],
    ]),
    'stop_times.txt': table(['trip_id', 'stop_id', 'stop_sequence', 'arrival_time', 'departure_time', 'pickup_type', 'drop_off_type', 'stop_headsign'], [
      ['t1', 's1', '1', '10:05:00', '10:05:00', '0', '0', 'Synthetic platform headsign'],
      ['t1', 's2', '2', '10:10:00', '10:10:00'],
      ['t2', 's1', '1', '10:20:00', '10:20:00'], ['t2', 's2', '2', '10:25:00', '10:25:00'],
      ['sat', 's1', '1', '10:10:00', '10:10:00'], ['sat', 's2', '2', '10:15:00', '10:15:00'],
      ['sun', 's1', '1', '10:15:00', '10:15:00'], ['sun', 's2', '2', '10:20:00', '10:20:00'],
      ['night', 's1', '1', '25:15:00', '25:15:00'], ['night', 's2', '2', '25:20:00', '25:20:00'],
    ]),
    'calendar.txt': table(['service_id', 'start_date', 'end_date', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], [
      ['wk', '20260101', '20261231', '1', '1', '1', '1', '1', '0', '0'],
      ['sat', '20260101', '20261231', '0', '0', '0', '0', '0', '1', '0'],
      ['sun', '20260101', '20261231', '0', '0', '0', '0', '0', '0', '1'],
    ]),
  };
}
export const fixtureDigest = () => normalizeGtfs(fixtureTables(), {
  source: 'https://example.test/synthetic.zip', fetchedAt: '2026-11-14T12:00:00Z',
  sha256: 'a'.repeat(64), archiveBytes: 1234, quality: 'simulated',
});
export function fixtureWalk(): WalkingAccess {
  return { mode: 'walk', profile: 'foot-walking', from: [21.22, 45.75], to: [21.221, 45.751],
    geometry: [[21.22, 45.75], [21.2204, 45.7508], [21.221, 45.751]],
    distanceMeters: 400, durationSeconds: 360, source: 'SYNTHETIC TEST walking route',
    quality: 'simulated', calculatedAt: '2026-11-16T07:00:00Z' };
}
