import {
  distanceM,
  inRing,
  ringAreaM2,
  ringCentre,
  TARIFF_LABEL_RO,
  type AreaProfile,
  type CandidateKind,
  type Coordinate,
  type OsmPlace,
  type Parking,
  type RecommendationOption,
  type StreetIndex,
  type TariffColor,
  type TimparkSnapshot,
} from '@vlaiq/shared';
import { osmPrice, timparkPrice, zoneEstimatePrice } from './price';
import { CANDIDATE_RADIUS_M, CUSTOMERS_ONLY_MAX_M, MAX_STREET_CANDIDATES } from './weights';

/** A parking candidate before walking times are known. */
export interface Candidate {
  id: string;
  kind: CandidateKind;
  name: string;
  nameIsDerived: boolean;
  coordinate: Coordinate;
  straightM: number;
  access: RecommendationOption['access'];
  tariff: TariffColor | null;
  smsCode: string | null;
  capacity: RecommendationOption['capacity'];
  profile: AreaProfile;
  price: RecommendationOption['price'];
  flags: string[];
}

export interface CandidateInput {
  destination: Coordinate;
  at: Date;
  stayMinutes: number;
  parkings: Parking[];
  timpark: TimparkSnapshot | null;
  places: OsmPlace[];
  streets: StreetIndex | null;
}

/** Timpark lots: about 25 m² of surface per car including the aisles (common planning figure). */
const M2_PER_SPACE = 25;

const PROFILE_RADIUS_M: Partial<Record<OsmPlace['category'], [AreaProfile, number]>> = {
  mall: ['commercial', 250],
  university: ['campus', 300],
  hospital: ['hospital', 250],
  station: ['station', 300],
  bus_station: ['station', 200],
};

/** Area profile of a point, from the Timpark zone it lies in and the major places around it. */
export function areaProfile(
  point: Coordinate,
  ctx: {
    zones: { tariff: TariffColor; ring: Coordinate[] }[];
    places: OsmPlace[];
    customersOnly?: boolean;
    tariff?: TariffColor | null;
  },
): AreaProfile {
  const near = (category: OsmPlace['category']) => {
    const rule = PROFILE_RADIUS_M[category];
    return (
      !!rule &&
      ctx.places.some((p) => p.category === category && distanceM(point, [p.lng, p.lat]) <= rule[1])
    );
  };
  if (ctx.customersOnly || near('mall')) return 'commercial';
  const zone = ctx.zones.find((z) => inRing(point, z.ring));
  const tariff = ctx.tariff ?? zone?.tariff;
  if (tariff === 'green' || tariff === 'red') return 'centre';
  if (near('university')) return 'campus';
  if (near('hospital')) return 'hospital';
  if (near('station') || near('bus_station')) return 'station';
  return 'residential';
}

function derivedName(prefix: string, point: Coordinate, streets: StreetIndex | null): string {
  const street = streets?.nearest(point, 120);
  return street ? `${prefix} lângă ${street.name}` : prefix;
}

/** Every parking within CANDIDATE_RADIUS_M of the destination, from Timpark and OpenStreetMap. */
export function buildCandidates(input: CandidateInput): Candidate[] {
  const { destination, at, stayMinutes, timpark, places, streets } = input;
  const out: Candidate[] = [];
  const features = timpark?.data.features ?? [];
  const tariffs = timpark?.data.tariffs;
  const timparkSource = timpark
    ? `Primăria Timișoara, date Timpark (${timpark.fetchedAt.slice(0, 10)})`
    : '';
  const zones = features
    .filter((f) => f.kind === 'zone')
    .map((f) => ({ tariff: f.tariff, progressive: f.progressive, ring: f.coordinates as Coordinate[] }));

  // 1. Timpark lots: polygons with a real tariff.
  const lots = features.filter((f) => f.kind === 'lot');
  for (const f of lots) {
    const ring = f.coordinates as Coordinate[];
    const centre = ringCentre(ring);
    const d = distanceM(destination, centre);
    if (d > CANDIDATE_RADIUS_M || !tariffs) continue;
    const area = ringAreaM2(ring);
    const cap = area >= 100 ? Math.round(area / M2_PER_SPACE) : null;
    const named = f.name.trim() !== '';
    out.push({
      id: `timpark-${f.id}`,
      kind: 'timpark_lot',
      name: named
        ? `Parcare Timpark ${f.name.trim()}`
        : derivedName('Parcare Timpark', centre, streets),
      nameIsDerived: !named,
      coordinate: centre,
      straightM: d,
      access: 'public',
      tariff: f.tariff,
      smsCode: f.progressive ? null : tariffs.hourly[f.tariff].code,
      capacity: cap
        ? {
            value: cap,
            quality: 'estimated',
            source: `suprafața conturului Timpark ÷ ${M2_PER_SPACE} m² pe loc`,
          }
        : { value: null, quality: 'unknown', source: 'none' },
      profile: areaProfile(centre, { zones, places, tariff: f.tariff }),
      price: timparkPrice(f.tariff, f.progressive, at, stayMinutes, tariffs, timparkSource),
      flags: f.checked ? [] : ['Contur neverificat de Primărie'],
    });
  }

  // 2. Paid street parking: the nearest point of each street, nearest streets first, one entry per name.
  if (tariffs) {
    const byName = new Map<
      string,
      { f: (typeof features)[number]; point: Coordinate; d: number }
    >();
    for (const f of features) {
      if (f.kind !== 'street') continue;
      let best: { point: Coordinate; d: number } | null = null;
      for (const p of f.coordinates as Coordinate[]) {
        const d = distanceM(destination, p);
        if (!best || d < best.d) best = { point: p, d };
      }
      if (!best || best.d > CANDIDATE_RADIUS_M) continue;
      const key = `${f.name.trim().toLowerCase()}|${f.tariff}`;
      const prev = byName.get(key);
      if (!prev || best.d < prev.d) byName.set(key, { f, ...best });
    }
    const nearest = [...byName.values()].sort((a, b) => a.d - b.d).slice(0, MAX_STREET_CANDIDATES);
    for (const { f, point, d } of nearest) {
      const named = f.name.trim() !== '';
      out.push({
        id: `timpark-${f.id}`,
        kind: 'timpark_street',
        name: named
          ? `Stradă cu plată: ${f.name.trim()}`
          : derivedName('Stradă cu plată', point, streets),
        nameIsDerived: !named,
        coordinate: point,
        straightM: d,
        access: 'public',
        tariff: f.tariff,
        smsCode: f.progressive ? null : tariffs.hourly[f.tariff].code,
        capacity: { value: null, quality: 'unknown', source: 'none' },
        profile: areaProfile(point, { zones, places, tariff: f.tariff }),
        price: timparkPrice(f.tariff, f.progressive, at, stayMinutes, tariffs, timparkSource),
        flags: f.checked ? [] : ['Segment neverificat de Primărie'],
      });
    }
  }

  // 3. OpenStreetMap parkings that are not already a Timpark lot.
  const lotRings = lots.map((f) => ({
    ring: f.coordinates as Coordinate[],
    centre: ringCentre(f.coordinates as Coordinate[]),
  }));
  for (const p of input.parkings) {
    const point: Coordinate = [p.lng, p.lat];
    const d = distanceM(destination, point);
    if (d > CANDIDATE_RADIUS_M) continue;
    if (p.access === 'customers' && d > CUSTOMERS_ONLY_MAX_M) continue;
    if (lotRings.some((l) => inRing(point, l.ring))) continue;
    const flags: string[] = [];
    if (p.access === 'customers') flags.push('Doar pentru clienți');
    if (p.access === 'unknown') flags.push('Acces nespecificat în OpenStreetMap');
    if (p.nameIsDerived) flags.push('Nume dat de noi după poziție, nu oficial');
    const feeNo = p.price.value?.perHourRon === 0;
    // Inside a paid Timpark zone a public lot most likely pays the zone tariff (spec §5.2).
    // Customers-only lots (shops, malls) keep their own rules.
    const zone = p.access !== 'customers' && tariffs ? zones.find((z) => inRing(point, z.ring)) : undefined;
    if (zone) {
      flags.push(`În zona Timpark ${TARIFF_LABEL_RO[zone.tariff]}: am presupus tariful zonei, neconfirmat aici`);
    }
    const price =
      zone && tariffs
        ? zoneEstimatePrice(
            timparkPrice(zone.tariff, zone.progressive, at, stayMinutes, tariffs, timparkSource),
            zone.tariff,
            feeNo,
          )
        : osmPrice(feeNo, p.price.source);
    out.push({
      id: p.id,
      kind: 'osm',
      name: p.name,
      nameIsDerived: p.nameIsDerived,
      coordinate: point,
      straightM: d,
      access: p.access,
      tariff: null,
      smsCode: null,
      capacity:
        p.capacity.value != null && p.capacity.value > 0
          ? { value: p.capacity.value, quality: p.capacity.quality, source: p.capacity.source }
          : { value: null, quality: 'unknown', source: 'none' },
      profile: areaProfile(point, { zones, places, customersOnly: p.access === 'customers' }),
      price,
      flags,
    });
  }
  return out.sort((a, b) => a.straightM - b.straightM);
}
