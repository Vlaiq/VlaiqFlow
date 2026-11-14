import {
  insideZone,
  osmUrlOf,
  SCHOOL_WINDOWS,
  SCHOOL_ZONE,
  SCHOOL_ZONE_NOTE,
  SCHOOL_ZONE_SOURCE,
  schoolsNear,
  schoolWindowAt,
  type Coordinate,
  type OsmSchool,
  type ProtectedZone,
  type SchoolZoneMode,
  type StreetIndex,
} from '@vlaiq/shared';
import { slotOf } from './occupancy';

/**
 * The school drop-off zone for a destination at an arrival time (spec §6.16), or null when no school or
 * kindergarten from OpenStreetMap lies within SCHOOL_ZONE.triggerM of the destination. Pure and deterministic.
 */
export function schoolZone(input: {
  destination: Coordinate;
  at: Date;
  mode: SchoolZoneMode;
  schools: OsmSchool[];
  streets?: StreetIndex | null;
}): ProtectedZone | null {
  const near = schoolsNear(input.destination, input.schools);
  if (near.length === 0) return null;
  const { window, reason } = schoolWindowAt(slotOf(input.at));
  const active = window != null;
  const optedOut = input.mode === 'off';
  return {
    active,
    optedOut,
    applied: active && !optedOut,
    radiusM: SCHOOL_ZONE.radiusM,
    schools: near.map(({ school: s, distanceM }) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      coordinate: [s.lng, s.lat],
      distanceM: Math.round(distanceM),
      street: input.streets?.nearest([s.lng, s.lat], 120)?.name ?? null,
      osmUrl: osmUrlOf(s.id),
    })),
    window,
    windows: SCHOOL_WINDOWS,
    inactiveReason: reason,
    excluded: 0,
    insideZone: 0,
    quality: 'estimated',
    source: SCHOOL_ZONE_SOURCE,
    note: SCHOOL_ZONE_NOTE,
  };
}

/**
 * Splits candidates by the zone. When the zone is applied the inside ones are left out of the ranking;
 * otherwise everything is kept. The counts are written onto the zone.
 */
export function applySchoolZone<T extends { coordinate: Coordinate }>(
  candidates: T[],
  zone: ProtectedZone | null,
): { kept: T[]; zone: ProtectedZone | null } {
  if (!zone) return { kept: candidates, zone };
  const inside = candidates.filter((c) => insideZone(c.coordinate, zone));
  const kept = zone.applied ? candidates.filter((c) => !insideZone(c.coordinate, zone)) : candidates;
  return { kept, zone: { ...zone, insideZone: inside.length, excluded: zone.applied ? inside.length : 0 } };
}
