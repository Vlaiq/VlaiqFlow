import type { Coordinate } from '@vlaiq/shared';
import type { NavPlace } from './places';

/**
 * What the planner knows about the parking we navigate to, handed over in the /navigation URL so the
 * DEMO "parking full" scenario (spec §6.9) can offer the next SmartMatch option. Every number here
 * comes from SmartMatch output; the navigation screen never computes or invents one.
 */
export interface ParkingHandoff {
  /** Estimated chance of a free space at the current target (0–1), and its walk to the destination. */
  current: { chance: number | null; walkMinutes: number | null };
  /** The next SmartMatch option, if there is one. */
  backup: { place: NavPlace; chance: number; walkMinutes: number } | null;
  /** The final destination, reached on foot after parking. */
  final: { name: string; coordinate: Coordinate } | null;
}

export interface HandoffInput {
  chance?: number | null;
  walkMinutes?: number | null;
  backup?: { name: string; coordinate: Coordinate; chance: number; walkMinutes: number } | null;
  final?: { name: string; coordinate: Coordinate } | null;
}

// Same prototype area the backend accepts for routing (places.ts, backend/src/routes/navigation.ts).
const inArea = ([lng, lat]: Coordinate) => lng >= 21 && lng <= 21.5 && lat >= 45.6 && lat <= 45.9;
const coord = (c: Coordinate) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`;
const round = (n: number, digits: number) => String(Math.round(n * 10 ** digits) / 10 ** digits);

/** URL parameters for the handoff, to merge into a /navigation link. */
export function handoffParams(input: HandoffInput): Record<string, string> {
  const out: Record<string, string> = {};
  if (input.chance != null) out.chance = round(input.chance, 3);
  if (input.walkMinutes != null) out.walk = round(input.walkMinutes, 1);
  if (input.backup) {
    out.alt = coord(input.backup.coordinate);
    out.altName = input.backup.name;
    out.altChance = round(input.backup.chance, 3);
    out.altWalk = round(input.backup.walkMinutes, 1);
  }
  if (input.final) {
    out.final = coord(input.final.coordinate);
    out.finalName = input.final.name;
  }
  return out;
}

const parseCoordinate = (value: string | null): Coordinate | null => {
  const [lng, lat] = (value ?? '').split(',').map(Number);
  if (lng == null || lat == null || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const c: Coordinate = [lng, lat];
  return inArea(c) ? c : null;
};
const parseShare = (value: string | null) => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
};
const parseMinutes = (value: string | null) => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 120 ? n : null;
};

/** Reads the handoff back; anything malformed or outside the routing area is dropped, not guessed. */
export function handoffFromUrl(search: string): ParkingHandoff {
  const q = new URLSearchParams(search);
  const altCoordinate = parseCoordinate(q.get('alt'));
  const altName = q.get('altName')?.trim().slice(0, 120);
  const altChance = parseShare(q.get('altChance'));
  const altWalk = parseMinutes(q.get('altWalk'));
  const finalCoordinate = parseCoordinate(q.get('final'));
  const finalName = q.get('finalName')?.trim().slice(0, 120);
  return {
    current: { chance: parseShare(q.get('chance')), walkMinutes: parseMinutes(q.get('walk')) },
    backup:
      altCoordinate && altName && altChance != null && altWalk != null
        ? {
            place: {
              id: `alt-${altCoordinate.join(',')}`,
              name: altName,
              area: finalName ? `Parcare pentru ${finalName}` : 'Parcare de rezervă',
              coordinate: altCoordinate,
            },
            chance: altChance,
            walkMinutes: altWalk,
          }
        : null,
    final: finalCoordinate && finalName ? { name: finalName, coordinate: finalCoordinate } : null,
  };
}
