import type {
  Destination,
  NeighbourhoodFeature,
  OsmPlace,
  OsmStreet,
  Poi,
  RegisterStreet,
} from './schemas/city';
import type { TimparkFeature } from './schemas/timpark';
import { distanceM, inNeighbourhood, neighbourhoodAt, representativePoint } from './geo';

// ---- Text normalisation --------------------------------------------------------------------------

/** Lowercase, no diacritics (ș/ş, ț/ţ, ă, â, î), punctuation → spaces. "Piața" and "piata" match. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const TYPE_ABBREVIATIONS: [RegExp, string][] = [
  [/^b dul\b|^bd\b|^blvd\b|^bdul\b/, 'bulevardul'],
  [/^str\b/, 'strada'],
  [/^p ta\b|^pta\b|^piata\b/, 'piata'],
  [/^cal\b/, 'calea'],
  [/^al\b/, 'aleea'],
  [/^spl\b/, 'splaiul'],
  [/^intr\b/, 'intrarea'],
];
const STREET_TYPES = ['strada', 'bulevardul', 'piata', 'calea', 'aleea', 'splaiul', 'intrarea', 'scuarul'];

/** Normalised full street name with abbreviations expanded: "B-dul Dr.Iosif Bulbuca" → "bulevardul dr iosif bulbuca". */
export function normalizeStreetName(raw: string): string {
  let text = raw.trim();
  // "1 Decembrie 1918, Blvd." → "Blvd. 1 Decembrie 1918"
  const suffixType = text.match(/^(.*),\s*(blvd\.?|bd\.?|str\.?)$/i);
  if (suffixType?.[1] && suffixType[2]) text = `${suffixType[2]} ${suffixType[1]}`;
  let n = normalize(text);
  for (const [re, full] of TYPE_ABBREVIATIONS) n = n.replace(re, full);
  return n;
}

/** The street name without its type word: "strada eugeniu de savoya" → "eugeniu de savoya". */
function withoutType(normalized: string): string {
  const [first, ...rest] = normalized.split(' ');
  return first && STREET_TYPES.includes(first) ? rest.join(' ') : normalized;
}

// ---- Geometry helpers ----------------------------------------------------------------------------

type LngLat = [number, number];

function segmentLength(coords: LngLat[]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    d += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return d;
}

/** A representative point on the longest segment (its middle vertex, or the midpoint of a 2-point line). */
function pointOnLongest(segments: LngLat[][]): { lat: number; lng: number } | null {
  const longest = [...segments].sort((a, b) => segmentLength(b) - segmentLength(a))[0];
  if (!longest || longest.length === 0) return null;
  if (longest.length === 2) {
    const [a, b] = longest as [LngLat, LngLat];
    return { lng: (a[0] + b[0]) / 2, lat: (a[1] + b[1]) / 2 };
  }
  const mid = longest[Math.floor(longest.length / 2)]!;
  return { lng: mid[0], lat: mid[1] };
}

/** Average of the outer ring of the largest polygon. Approximate, labelled as such in the UI. */
function neighbourhoodCentre(f: NeighbourhoodFeature): { lat: number; lng: number } | null {
  const rings: LngLat[][] =
    f.geometry.type === 'Polygon'
      ? [f.geometry.coordinates[0] ?? []]
      : f.geometry.coordinates.map((p) => p[0] ?? []);
  const ring = [...rings].sort((a, b) => b.length - a.length)[0];
  if (!ring || ring.length === 0) return null;
  const sum = ring.reduce((acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }), { lng: 0, lat: 0 });
  return { lng: sum.lng / ring.length, lat: sum.lat / ring.length };
}

// ---- Building the destination list ---------------------------------------------------------------

export interface DestinationInputs {
  streets: RegisterStreet[];
  pois: Poi[];
  neighbourhoods: NeighbourhoodFeature[];
  timparkStreets: TimparkFeature[];
  osmStreets?: OsmStreet[];
  osmPlaces?: OsmPlace[];
}

export const PLACE_CATEGORY_RO: Record<OsmPlace['category'], string> = {
  mall: 'Centru comercial',
  station: 'Gară',
  bus_station: 'Autogară',
  hospital: 'Spital / clinică',
  university: 'Universitate',
  stadium: 'Stadion',
  park: 'Parc',
};

/** Same name and category within 400 m → one destination (OSM often maps a building and its campus). */
function dedupePlaces(places: OsmPlace[]): OsmPlace[] {
  const kept: OsmPlace[] = [];
  for (const p of places) {
    const key = normalize(p.name);
    const dup = kept.some(
      (k) => k.category === p.category && normalize(k.name) === key && distanceM([k.lng, k.lat], [p.lng, p.lat]) < 400,
    );
    if (!dup) kept.push(p);
  }
  return kept;
}

/** Finds the official neighbourhood outline for the register's free-text neighbourhood ("Circumvalațiunii I"). */
function matchNeighbourhood(registerName: string, outlines: { parts: string[]; feature: NeighbourhoodFeature }[]) {
  const n = normalize(registerName.split(/[,/(-]/)[0] ?? '');
  if (n.length < 3) return null;
  return outlines.find((o) => o.parts.some((p) => n === p || n.startsWith(`${p} `) || p.startsWith(`${n} `)))?.feature ?? null;
}

export function buildDestinations({
  streets,
  pois,
  neighbourhoods,
  timparkStreets,
  osmStreets = [],
  osmPlaces = [],
}: DestinationInputs): Destination[] {
  const out: Destination[] = [];
  // Points outside every official neighbourhood are outside the municipality (Dumbrăvița, Giroc…).
  const insideCity = (p: [number, number]) =>
    neighbourhoods.length === 0 || neighbourhoods.some((n) => inNeighbourhood(p, n));

  // Landmarks: exact coordinates from the City Hall.
  for (const p of pois) {
    out.push({
      id: `poi-${p.id}`,
      kind: 'landmark',
      name: p.name,
      nameEn: p.nameEn,
      detail: p.address,
      category: null,
      aliases: p.nameEn ? [p.nameEn] : [],
      location: { lat: p.lat, lng: p.lng },
      precision: 'exact',
      locationSource: 'Primăria Timișoara (obiective turistice)',
    });
  }

  // Street geometry known from Timpark, keyed by normalised full name and by name without type.
  const byFull = new Map<string, LngLat[][]>();
  const byBare = new Map<string, LngLat[][]>();
  for (const t of timparkStreets) {
    const full = normalizeStreetName(t.name);
    const push = (m: Map<string, LngLat[][]>, k: string) => m.set(k, [...(m.get(k) ?? []), t.coordinates as LngLat[]]);
    push(byFull, full);
    // "Babac, Nicolae" → "nicolae babac"
    const swapped = t.name.match(/^([^,]+),\s*([^,]+)$/);
    push(byBare, swapped?.[1] && swapped[2] ? normalize(`${swapped[2]} ${swapped[1]}`) : withoutType(full));
  }

  // Major places from OpenStreetMap that the register does not list (malls, stations, hospitals…).
  for (const p of dedupePlaces(osmPlaces)) {
    if (!insideCity([p.lng, p.lat])) continue;
    const hood = neighbourhoodAt([p.lng, p.lat], neighbourhoods);
    out.push({
      id: `place-${p.id}`,
      kind: 'place',
      name: p.name,
      nameEn: null,
      detail: hood ? hood.properties.name : null,
      category: p.category,
      aliases: [],
      location: { lat: p.lat, lng: p.lng },
      precision: 'exact',
      locationSource: 'OpenStreetMap',
    });
  }

  // OpenStreetMap street geometry inside the municipality, keyed like the Timpark map below.
  const osmByFull = new Map<string, [number, number][]>();
  const osmByBare = new Map<string, [number, number][]>();
  for (const s of osmStreets) {
    const points = s.points.filter(insideCity);
    if (points.length === 0) continue;
    const full = normalizeStreetName(s.name);
    osmByFull.set(full, [...(osmByFull.get(full) ?? []), ...points]);
    const bare = withoutType(full);
    osmByBare.set(bare, [...(osmByBare.get(bare) ?? []), ...points]);
  }

  // Landmarks whose address names the street ("Piața Victoriei nr. 2").
  const landmarkOnStreet = new Map<string, Poi>();
  for (const p of pois) {
    for (const part of (p.address ?? '').split('/')) {
      const street = normalizeStreetName(part.replace(/\bnr\.?\s*\d+.*$/i, ''));
      if (street && !landmarkOnStreet.has(street)) landmarkOnStreet.set(street, p);
    }
  }

  const outlines = neighbourhoods.map((feature) => ({
    feature,
    parts: feature.properties.name.split(',').map((s) => normalize(s)),
  }));
  const bareCounts = new Map<string, number>();
  for (const s of streets) {
    const bare = normalize(s.current);
    bareCounts.set(bare, (bareCounts.get(bare) ?? 0) + 1);
  }

  for (const s of streets) {
    if (s.status !== 'Existenta') continue; // decommissioned streets are not destinations
    const full = normalizeStreetName(s.name);
    const bare = normalize(s.current);
    const uniqueBare = bareCounts.get(bare) === 1;

    let location: Destination['location'] = null;
    let precision: Destination['precision'] = 'none';
    let locationSource = 'Poziție necunoscută';

    const timpark = byFull.get(full) ?? (uniqueBare ? byBare.get(bare) : undefined);
    const landmark = landmarkOnStreet.get(full);
    const osm = osmByFull.get(full) ?? (uniqueBare ? osmByBare.get(bare) : undefined);
    const osmPoint = osm ? representativePoint(osm) : null;
    if (timpark) {
      location = pointOnLongest(timpark);
      precision = 'street';
      locationSource = 'Geometria străzii din datele Timpark (Primăria Timișoara)';
    } else if (osmPoint) {
      location = { lng: osmPoint[0], lat: osmPoint[1] };
      precision = 'street';
      locationSource = 'Geometria străzii din OpenStreetMap, potrivită după numele oficial';
    } else if (landmark) {
      location = { lat: landmark.lat, lng: landmark.lng };
      precision = 'street';
      locationSource = `Obiectivul „${landmark.name}” de pe această stradă`;
    } else if (s.neighbourhood) {
      const hood = matchNeighbourhood(s.neighbourhood, outlines);
      const centre = hood ? neighbourhoodCentre(hood) : null;
      if (hood && centre) {
        location = centre;
        precision = 'neighbourhood';
        locationSource = `Centrul aproximativ al cartierului ${hood.properties.name}`;
      }
    }

    out.push({
      id: `street-${s.id}`,
      kind: 'street',
      name: s.name,
      nameEn: null,
      detail: s.neighbourhood,
      category: null,
      aliases: s.previous && normalize(s.previous) !== bare ? [s.previous] : [],
      location,
      precision,
      locationSource,
    });
  }

  for (const n of neighbourhoods) {
    const centre = neighbourhoodCentre(n);
    out.push({
      id: `hood-${n.properties.slug}`,
      kind: 'neighbourhood',
      name: n.properties.name,
      nameEn: null,
      detail: 'Cartier',
      category: null,
      aliases: [],
      location: centre,
      precision: centre ? 'neighbourhood' : 'none',
      locationSource: 'Conturul cartierului (Primăria Timișoara)',
    });
  }

  return out;
}

// ---- Search --------------------------------------------------------------------------------------

const KIND_RANK: Record<Destination['kind'], number> = { landmark: 0, place: 1, street: 2, neighbourhood: 3 };
const PRECISION_RANK: Record<Destination['precision'], number> = { exact: 0, street: 1, neighbourhood: 2, none: 3 };

export interface SearchIndexEntry {
  destination: Destination;
  name: string; // normalised name
  tokens: string[]; // normalised tokens of the name and aliases
}

export function buildSearchIndex(destinations: Destination[]): SearchIndexEntry[] {
  return destinations.map((d) => {
    const name = normalize(d.name);
    const tokens = [name, ...d.aliases.map(normalize)].join(' ').split(' ').filter(Boolean);
    return { destination: d, name, tokens };
  });
}

/** Accent-insensitive prefix search: every query word must start a word of the name or an alias. */
export function searchDestinations(index: SearchIndexEntry[], query: string, limit = 8): Destination[] {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const q = words.join(' ');

  const scored: { d: Destination; score: number }[] = [];
  for (const e of index) {
    if (!words.every((w) => e.tokens.some((t) => t.startsWith(w)))) continue;
    const starts = e.name.startsWith(q) || withoutType(e.name).startsWith(q) ? 0 : 1;
    const score =
      starts * 100 + KIND_RANK[e.destination.kind] * 10 + PRECISION_RANK[e.destination.precision] + e.name.length / 1000;
    scored.push({ d: e.destination, score });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.d);
}
