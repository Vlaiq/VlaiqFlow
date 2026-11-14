import { distanceM, type LngLat } from './geo';
import type { OsmSchool } from './schemas/city';
import type { AvoidCircle, ProtectedZone, TimeWindow } from './schemas/protectedZone';

/**
 * Rules for "Zone protejate la școli" (spec §6.16). Deterministic and documented:
 * - a school or kindergarten (OpenStreetMap) within TRIGGER_M of the destination opens a zone;
 * - the zone is a circle of RADIUS_M around each such school (our rule, not an official City Hall zone);
 * - it is active Monday–Friday, except public holidays, inside SCHOOL_WINDOWS, Europe/Bucharest;
 * - while applied, candidate parkings inside the zone are left out. Vacations are not modeled.
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
  'OpenStreetMap contributors · ODbL. Regula VLAIQ FLOW: cerc de 250 m, luni–vineri, cu excepția sărbătorilor legale, în intervalele configurate (Europe/Bucharest)';

export const SCHOOL_ZONE_NOTE =
  'Recomandare a aplicației, nu restricție oficială de circulație. Punctele OSM pot fi centre aproximative, nu intrări verificate. Vacanțele școlare nu sunt incluse; poți opri recomandarea pentru acest drum.';

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

const validCoordinate = ([lng, lat]: LngLat) =>
  Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
// Absorb sub-micrometre floating-point noise at the documented inclusive/exclusive boundaries.
const BOUNDARY_EPSILON_M = 1e-6;

/** Schools within the inclusive trigger, nearest first; repeated OSM IDs consume only one slot. */
export function schoolsNear(destination: LngLat, schools: OsmSchool[]) {
  if (!validCoordinate(destination)) return [];
  const seen = new Set<string>();
  return schools
    .filter((s) => validCoordinate([s.lng, s.lat]) && osmUrlOf(s.id) !== null)
    .map((s) => ({ school: s, distanceM: distanceM(destination, [s.lng, s.lat]) }))
    .filter((s) => s.distanceM <= SCHOOL_ZONE.triggerM + BOUNDARY_EPSILON_M)
    .sort((a, b) =>
      a.distanceM - b.distanceM || compareText(a.school.id, b.school.id)
      || a.school.lng - b.school.lng || a.school.lat - b.school.lat
      || compareText(a.school.name ?? '', b.school.name ?? '') || compareText(a.school.kind, b.school.kind),
    )
    .filter(({ school }) => {
      if (seen.has(school.id)) return false;
      seen.add(school.id);
      return true;
    })
    .slice(0, SCHOOL_ZONE.maxSchools);
}

/** Strict interior of the union of circles; a point on the radius is retained. */
export function insideZone(point: LngLat, zone: Pick<ProtectedZone, 'schools' | 'radiusM'>): boolean {
  return validCoordinate(point) && Number.isFinite(zone.radiusM) && zone.radiusM > 0
    && zone.schools.some((s) => validCoordinate(s.coordinate)
      && distanceM(point, s.coordinate) < zone.radiusM - BOUNDARY_EPSILON_M);
}

/** The zone as circles for the routing proxy. */
export function zoneCircles(zone: Pick<ProtectedZone, 'schools' | 'radiusM'>): AvoidCircle[] {
  return zone.schools.map((s) => ({ center: s.coordinate, radiusM: zone.radiusM }));
}

/** A closed polygon ring approximating a circle (for the map and for openrouteservice avoid_polygons). */
export function circleRing(center: LngLat, radiusM: number, steps = 32): LngLat[] {
  // This is a local city approximation. Reject invalid/degenerate rings instead of emitting NaN
  // or out-of-range provider coordinates (including circles crossing a pole or the dateline).
  if (!validCoordinate(center) || !Number.isFinite(radiusM) || radiusM <= 0
    || !Number.isInteger(steps) || steps < 3) return [];
  const [lng, lat] = center;
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: LngLat[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([+(lng + dLng * Math.cos(a)).toFixed(6), +(lat + dLat * Math.sin(a)).toFixed(6)]);
  }
  if (ring.some((p) => !validCoordinate(p)) || new Set(ring.map((p) => p.join(','))).size < 3) return [];
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
  s.name?.trim() || `${KIND_RO[s.kind]} (fără nume în OpenStreetMap)`;

const parkingCount = (n: number, candidate = false) => {
  const de = n > 0 && (n % 100 >= 20 || n % 100 === 0) ? ' de' : '';
  return `${n}${de} ${n === 1 ? 'parcare' : 'parcări'}${candidate ? n === 1 ? ' candidată' : ' candidate' : ''}`;
};

/**
 * Text for a "Stradă școlară" proposal that the user copies into decidem.primariatm.ro.
 * Filled only from the zone's data; nothing is sent by the app and nothing is claimed about other parents.
 */
export function schoolStreetProposal(zone: ProtectedZone): { title: string; body: string } {
  const main = zone.schools[0]!;
  const name = schoolLabel(main);
  // The nearest OSM street to the school's centre is a hint, not necessarily its address.
  const street = main.street
    ? `Reper geografic: ${main.street}, cea mai apropiată stradă în OpenStreetMap de punctul instituției (nu o intrare sau adresă verificată).`
    : 'Strada și intrările care ar putea face obiectul propunerii trebuie identificate și verificate pe teren.';
  const windows = zone.windows.map((w) => `${w.start}–${w.end}`).join(', ');
  const others = zone.schools.slice(1).map(schoolLabel);
  const body = [
    `Propun evaluarea unei „Străzi școlare” în apropiere de ${name}. Autoritățile competente ar putea analiza limitarea temporară a traficului auto în intervalele ${windows}, în zilele cu activitate școlară, cu acces păstrat pentru riverani, persoane cu dizabilități și servicii de urgență. Calendarul școlar și condițiile de acces trebuie verificate înaintea oricărei măsuri.`,
    street,
    others.length ? `În aceeași zonă se află și: ${others.join(', ')}.` : '',
    `Scopul propus este reducerea traficului auto din apropierea instituției. Efectele nu au fost măsurate de aplicație. Parcările alternative, legalitatea opririi și traseele pietonale trebuie verificate; cercul de analiză nu certifică siguranța sau accesibilitatea.`,
    zone.insideZone > 0
      ? `În cercurile de analiză de ${zone.radiusM} m, aplicația a identificat ${parkingCount(zone.insideZone, true)}. La calculul acestei recomandări, ${zone.excluded === 1 ? 'a fost exclusă' : 'au fost excluse'} ${parkingCount(zone.excluded)}. Numărul nu reprezintă locuri libere și nu este un inventar complet al zonei.`
      : '',
    main.osmUrl ? `Locul pe hartă: ${main.osmUrl}` : '',
    `Ciornă pregătită cu ajutorul VLAIQ FLOW (proiect UniHack 2026), fără aprobare oficială. Utilizatorul decide dacă o modifică și o trimite; aplicația nu a trimis nimic în numele său.`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { title: `Stradă școlară la ${name}`, body };
}

export const DECIDEM_URL = 'https://decidem.primariatm.ro';

/** OSM element page from our ids ("osm-way-123" → https://www.openstreetmap.org/way/123). */
export function osmUrlOf(id: string): string | null {
  const m = id.match(/^osm-(node|way|relation)-([1-9]\d*)$/);
  return m ? `https://www.openstreetmap.org/${m[1]}/${m[2]}` : null;
}
