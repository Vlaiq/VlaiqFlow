import { AvoidCircle, type Coordinate, type Destination, type Parking } from '@vlaiq/shared';
import { api } from '../../services/api';

/** A place the navigation screen can route to, always taken from our data snapshots (never typed in by hand). */
export interface NavPlace {
  id: string;
  name: string;
  area: string;
  coordinate: Coordinate; // [lng, lat]
}

/** Preset destinations: real records from the snapshots, looked up by id. */
const PRESET_PARKING_IDS = ['osm-way-195026554']; // "Parcare 700" (OSM, multi-storey, public)
const PRESET_DESTINATION_IDS = [
  'place-osm-way-24042485', // Iulius Mall (OSM)
  'place-osm-node-9322434969', // Timișoara Nord station (OSM)
];
/** Demo / preview origin: Timișoara Nord railway station. */
const DEMO_ORIGIN_ID = 'place-osm-node-9322434969';

// Same prototype area the backend accepts for routing (backend/src/routes/navigation.ts).
const inArea = ([lng, lat]: Coordinate) => lng >= 21 && lng <= 21.5 && lat >= 45.6 && lat <= 45.9;

const fromDestination = (d: Destination): NavPlace | null =>
  d.location
    ? {
        id: d.id,
        name: d.name,
        area: d.detail ? `${d.detail} · Timișoara` : 'Timișoara',
        coordinate: [d.location.lng, d.location.lat],
      }
    : null;

const fromParking = (p: Parking): NavPlace => ({
  id: p.id,
  name: p.name,
  area: `${p.neighbourhood ? `${p.neighbourhood} · ` : ''}parcare din OpenStreetMap`,
  coordinate: [p.lng, p.lat],
});

/**
 * Destination handed over from the Explore screen: /navigation?to=lng,lat&name=…&area=…
 * Rejected unless the coordinates are numbers inside the routing area.
 */
export function placeFromUrl(search: string): NavPlace | null {
  const q = new URLSearchParams(search);
  const [lng, lat] = (q.get('to') ?? '').split(',').map(Number);
  const name = q.get('name')?.trim();
  if (lng == null || lat == null || !Number.isFinite(lng) || !Number.isFinite(lat) || !name)
    return null;
  const coordinate: Coordinate = [lng, lat];
  if (!inArea(coordinate)) return null;
  return {
    id: `url-${lng},${lat}`,
    name: name.slice(0, 120),
    area: (q.get('area') ?? 'Timișoara').slice(0, 120),
    coordinate,
  };
}

/** Link from any destination on the Explore screen to the navigation screen. */
export function navigationHref(d: Destination): string | null {
  if (!d.location) return null;
  const q = new URLSearchParams({
    to: `${d.location.lng.toFixed(6)},${d.location.lat.toFixed(6)}`,
    name: d.name,
    area: d.detail ? `${d.detail} · Timișoara` : 'Timișoara',
  });
  return `/navigation?${q.toString()}`;
}

export interface NavPlaces {
  destinations: NavPlace[]; // first one is selected initially
  origin: NavPlace;
  /** School zones the driving route keeps out of (§6.16), from the parking preview. */
  avoid?: AvoidCircle[];
}

/** "lng,lat,radius;…" from the parking preview link; anything malformed is ignored. */
export function avoidFromUrl(value: string | null): AvoidCircle[] {
  if (!value) return [];
  const circles = value.split(';').slice(0, 4).map((part) => {
    const [lng, lat, radiusM] = part.split(',').map(Number);
    return AvoidCircle.safeParse({ center: [lng, lat], radiusM });
  });
  return circles.flatMap((c) => (c.success ? [c.data] : []));
}

/** Loads presets from the backend snapshots; a destination from the URL goes first. */
export async function loadNavPlaces(search: string): Promise<NavPlaces> {
  const [dest, parks] = await Promise.all([api.destinations(), api.parkings()]);
  const byId = new Map(dest.destinations.map((d) => [d.id, d]));
  const parkingById = new Map(parks.parkings.map((p) => [p.id, p]));

  const presets = [
    ...PRESET_PARKING_IDS.map((id) => parkingById.get(id))
      .filter((p): p is Parking => !!p)
      .map(fromParking),
    ...PRESET_DESTINATION_IDS.map((id) => byId.get(id))
      .filter((d): d is Destination => !!d)
      .map(fromDestination)
      .filter((p): p is NavPlace => !!p),
  ];
  const originDest = byId.get(DEMO_ORIGIN_ID);
  const fallbackOrigin = originDest ? fromDestination(originDest) : null;
  const params = new URLSearchParams(search);
  const chosenOrigin = placeFromUrl(
    `?${new URLSearchParams({ to: params.get('from') ?? '', name: params.get('fromName') ?? '' })}`,
  );
  const origin = chosenOrigin ?? fallbackOrigin;
  if (!origin || presets.length === 0)
    throw new Error('Destinațiile pentru navigație nu sunt disponibile.');

  const fromUrl = placeFromUrl(search);
  const destinations = fromUrl
    ? [fromUrl, ...presets.filter((p) => p.name !== fromUrl.name)]
    : presets;
  // Never start with origin = destination.
  return {
    destinations: destinations.filter((p) => p.id !== origin.id || destinations.length === 1),
    origin,
    avoid: avoidFromUrl(params.get('avoid')),
  };
}
