import { distanceM, type LngLat } from './geo';
import type { OsmSchool } from './schemas/city';
import type { AvoidCircle, ProtectedZone, TimeWindow } from './schemas/protectedZone';

/**
 * Rules for "Zone protejate la școli" (spec §6.16). Deterministic and documented:
 * - a school or kindergarten (OpenStreetMap) within TRIGGER_M of the destination opens a zone;
 * - the zone is a circle of RADIUS_M around each such school (our rule, not an official City Hall zone);
 * - it is active on school days (Monday–Friday, not a public holiday) inside SCHOOL_WINDOWS, local time;
 * - while active, parkings inside the zone are left out, so the car stops ~3–4 min on foot away.
 */
export const SCHOOL_ZONE = {
  triggerM: 150,
  radiusM: 250,
  maxSchools: 4,
} as const;

/** Drop-off and pick-up peaks used by the feature (morning start, midday end of classes, afternoon end). */
export const SCHOOL_WINDOWS: TimeWindow[] = [
  { start: '07:30', end: '08:30' },
  { start: '12:00', end: '14:00' },
  { start: '16:00', end: '17:30' },
];

export const SCHOOL_ZONE_SOURCE =
  'Regula VLAIQ FLOW: cerc de 250 m în jurul școlilor și grădinițelor din OpenStreetMap, în zilele lucrătoare, la orele de intrare și ieșire';

export const SCHOOL_ZONE_NOTE =
  'Zona este o regulă a aplicației, nu o zonă oficială a Primăriei, și nu interzice accesul. Vacanțele școlare nu sunt încă incluse: în vacanță poți opri zona.';

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Local slot as produced by the backend (a public holiday counts as Sunday). */
export interface LocalSlot {
  day: 'weekday' | 'saturday' | 'sunday';
  hour: number;
  minute: number;
  holiday: string | null;
}

/** The school window at that local time, or null with the reason. End is exclusive. */
export function schoolWindowAt(slot: LocalSlot): { window: TimeWindow | null; reason: string | null } {
  if (slot.holiday) return { window: null, reason: `Zi liberă legală (${slot.holiday}): zona nu este activă.` };
  if (slot.day !== 'weekday') return { window: null, reason: 'În weekend zona nu este activă.' };
  const t = slot.hour * 60 + slot.minute;
  const window = SCHOOL_WINDOWS.find((w) => t >= minutesOf(w.start) && t < minutesOf(w.end)) ?? null;
  return window
    ? { window, reason: null }
    : { window: null, reason: `La ora sosirii nu este interval de intrare sau ieșire de la școală (${SCHOOL_WINDOWS.map((w) => `${w.start}–${w.end}`).join(', ')}).` };
}

/** Schools and kindergartens within TRIGGER_M of the destination, nearest first. */
export function schoolsNear(destination: LngLat, schools: OsmSchool[]) {
  return schools
    .map((s) => ({ school: s, distanceM: distanceM(destination, [s.lng, s.lat]) }))
    .filter((s) => s.distanceM <= SCHOOL_ZONE.triggerM)
    .sort((a, b) => a.distanceM - b.distanceM || a.school.id.localeCompare(b.school.id))
    .slice(0, SCHOOL_ZONE.maxSchools);
}

/** True if the point lies inside one of the zone's circles. */
export function insideZone(point: LngLat, zone: Pick<ProtectedZone, 'schools' | 'radiusM'>): boolean {
  return zone.schools.some((s) => distanceM(point, s.coordinate) < zone.radiusM);
}

/** The zone as circles for the routing proxy. */
export function zoneCircles(zone: Pick<ProtectedZone, 'schools' | 'radiusM'>): AvoidCircle[] {
  return zone.schools.map((s) => ({ center: s.coordinate, radiusM: zone.radiusM }));
}

/** A closed polygon ring approximating a circle (for the map and for openrouteservice avoid_polygons). */
export function circleRing(center: LngLat, radiusM: number, steps = 32): LngLat[] {
  const [lng, lat] = center;
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: LngLat[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([+(lng + dLng * Math.cos(a)).toFixed(6), +(lat + dLat * Math.sin(a)).toFixed(6)]);
  }
  ring.push(ring[0]!);
  return ring;
}

/** Metres of a route that run inside the circles (checked on the provider geometry, densified every ~10 m). */
export function metresInside(geometry: LngLat[], circles: AvoidCircle[]): number {
  if (!circles.length) return 0;
  let inside = 0;
  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1]!,
      b = geometry[i]!;
    const len = distanceM(a, b);
    const n = Math.max(1, Math.ceil(len / 10));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const p: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (circles.some((c) => distanceM(p, c.center) < c.radiusM)) inside += len / n;
    }
  }
  return Math.round(inside);
}

export const KIND_RO = { school: 'Școala', kindergarten: 'Grădinița' } as const;
export const schoolLabel = (s: { name: string | null; kind: 'school' | 'kindergarten' }) =>
  s.name ?? `${KIND_RO[s.kind]} (fără nume în OpenStreetMap)`;

/**
 * Text for a "Stradă școlară" proposal that the user copies into decidem.primariatm.ro.
 * Filled only from the zone's data; nothing is sent by the app and nothing is claimed about other parents.
 */
export function schoolStreetProposal(zone: ProtectedZone): { title: string; body: string } {
  const main = zone.schools[0]!;
  const name = schoolLabel(main);
  // The nearest OSM street to the school's centre is a hint, not necessarily its address.
  const street = main.street
    ? `strada de acces a școlii (cea mai apropiată în OpenStreetMap: ${main.street})`
    : 'strada de acces a școlii';
  const windows = zone.windows.map((w) => `${w.start}–${w.end}`).join(', ');
  const others = zone.schools.slice(1).map(schoolLabel);
  const body = [
    `Propun o „Stradă școlară” la ${name}: ${street} să fie închisă temporar traficului auto în zilele de școală, la orele de intrare și ieșire (${windows}), cu acces păstrat pentru riverani, persoane cu dizabilități și servicii de urgență.`,
    others.length ? `În aceeași zonă se află și: ${others.join(', ')}.` : '',
    `De ce: la aceste ore copiii ajung pe jos chiar lângă mașinile care opresc la poartă. Părinții care vin cu mașina pot opri la 250–300 m și merge 3–4 minute pe jos.`,
    zone.insideZone > 0
      ? `Pe o rază de ${zone.radiusM} m în jurul școlii sunt ${zone.insideZone} parcări cunoscute (Timpark și OpenStreetMap), pe care aplicația VLAIQ FLOW nu le mai recomandă la aceste ore.`
      : '',
    main.osmUrl ? `Locul pe hartă: ${main.osmUrl}` : '',
    `Propunere scrisă cu ajutorul VLAIQ FLOW (proiect UniHack 2026). Textul este al meu; aplicația nu a trimis nimic în numele meu.`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { title: `Stradă școlară la ${name}`, body };
}

export const DECIDEM_URL = 'https://decidem.primariatm.ro';

/** OSM element page from our ids ("osm-way-123" → https://www.openstreetmap.org/way/123). */
export function osmUrlOf(id: string): string | null {
  const m = id.match(/^osm-(node|way|relation)-(\d+)$/);
  return m ? `https://www.openstreetmap.org/${m[1]}/${m[2]}` : null;
}
