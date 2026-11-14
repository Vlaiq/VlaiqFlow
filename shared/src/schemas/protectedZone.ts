import { z } from 'zod';
import { Coordinate } from './navigation';

/**
 * "Zone protejate la școli" (spec §6.16). Around the schools next to the destination, at drop-off and
 * pick-up times, SmartMatch leaves out the parkings inside the zone so cars stop a short walk away.
 * The zone is our own rule (a circle around the OSM point), not an official City Hall zone.
 */
export const SchoolZoneMode = z.enum(['auto', 'off']);
export type SchoolZoneMode = z.infer<typeof SchoolZoneMode>;

/** Local Timișoara time, "HH:MM". */
export const TimeWindow = z.object({ start: z.string().regex(/^\d\d:\d\d$/), end: z.string().regex(/^\d\d:\d\d$/) });
export type TimeWindow = z.infer<typeof TimeWindow>;

export const ProtectedSchool = z.object({
  id: z.string(),
  name: z.string().nullable(),
  kind: z.enum(['school', 'kindergarten']),
  coordinate: Coordinate,
  /** Metres from the destination. */
  distanceM: z.number().nonnegative(),
  /** Nearest named street from OpenStreetMap, if one lies within 120 m. */
  street: z.string().nullable(),
  osmUrl: z.string().url().nullable(),
});
export type ProtectedSchool = z.infer<typeof ProtectedSchool>;

export const ProtectedZone = z.object({
  /** The arrival time falls inside a school window on a school day. */
  active: z.boolean(),
  /** The user switched it off for this trip (e.g. needs to reach the entrance by car). */
  optedOut: z.boolean(),
  /** active && !optedOut: parkings inside the zone were left out of the ranking. */
  applied: z.boolean(),
  radiusM: z.number().positive(),
  schools: z.array(ProtectedSchool).min(1),
  /** The window that contains the arrival time, when active. */
  window: TimeWindow.nullable(),
  windows: z.array(TimeWindow),
  /** Why the zone is not active at the arrival time (weekend, public holiday, outside the windows). */
  inactiveReason: z.string().nullable(),
  /** Parkings inside the zone that SmartMatch left out (0 when not applied). */
  excluded: z.number().int().nonnegative(),
  /** Parkings inside the zone among the candidates, whether or not they were left out. */
  insideZone: z.number().int().nonnegative(),
  quality: z.literal('estimated'),
  source: z.string(),
  note: z.string(),
});
export type ProtectedZone = z.infer<typeof ProtectedZone>;

/** A circle the driving route should avoid (sent to the routing proxy, turned into a polygon there). */
export const AvoidCircle = z.object({ center: Coordinate, radiusM: z.number().min(50).max(400) });
export type AvoidCircle = z.infer<typeof AvoidCircle>;
