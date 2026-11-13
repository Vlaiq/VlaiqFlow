import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildDestinations,
  NeighbourhoodsSnapshot,
  OsmPlacesSnapshot,
  OsmStreetsSnapshot,
  PoisSnapshot,
  StreetsSnapshot,
  TimparkSnapshot,
  type DestinationsResponse,
} from '@vlaiq/shared';

// Snapshots written by `pnpm data:city` (scripts/fetch-city-data.mjs). The app never calls the City Hall live.
const dataFile = (name: string) => fileURLToPath(new URL(`../../../shared/src/data/${name}`, import.meta.url));

function load<T>(name: string, schema: { safeParse: (x: unknown) => { success: true; data: T } | { success: false; error: { issues: unknown[] } } }): T | null {
  const file = dataFile(name);
  if (!existsSync(file)) {
    console.warn(`[city] ${name} not found. Run \`pnpm data:city\`.`);
    return null;
  }
  const parsed = schema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) {
    console.error(`[city] ${name} does not match the schema:`, parsed.error.issues.slice(0, 5));
    return null;
  }
  return parsed.data;
}

const timpark = load('timpark.json', TimparkSnapshot);
const streets = load('streets.json', StreetsSnapshot);
const pois = load('pois.json', PoisSnapshot);
const neighbourhoods = load('neighbourhoods.json', NeighbourhoodsSnapshot);
const osmStreets = load('osm-streets.json', OsmStreetsSnapshot);
const osmPlaces = load('osm-places.json', OsmPlacesSnapshot);

if (timpark) {
  console.log(`[city] Timpark: ${timpark.data.features.length} features, version ${timpark.data.version}, fetched ${timpark.fetchedAt}`);
}

function buildDestinationsResponse(): DestinationsResponse | null {
  if (!streets && !pois) return null;
  const destinations = buildDestinations({
    streets: streets?.data.streets ?? [],
    pois: pois?.data.pois ?? [],
    neighbourhoods: neighbourhoods?.data.features ?? [],
    timparkStreets: timpark?.data.features.filter((f) => f.kind === 'street') ?? [],
    osmStreets: osmStreets?.data.streets ?? [],
    osmPlaces: osmPlaces?.data.places ?? [],
  });
  const sources = [
    streets && { name: 'Registrul oficial de străzi', source: streets.source, fetchedAt: streets.fetchedAt },
    pois && { name: 'Obiective turistice', source: pois.source, fetchedAt: pois.fetchedAt },
    neighbourhoods && { name: 'Contururile cartierelor', source: neighbourhoods.source, fetchedAt: neighbourhoods.fetchedAt },
    timpark && { name: 'Geometria străzilor Timpark', source: timpark.source, fetchedAt: timpark.fetchedAt },
    osmStreets && { name: 'Geometria străzilor (OpenStreetMap)', source: osmStreets.source, fetchedAt: osmStreets.fetchedAt },
    osmPlaces && { name: 'Locuri importante (OpenStreetMap)', source: osmPlaces.source, fetchedAt: osmPlaces.fetchedAt },
  ].filter((s): s is DestinationsResponse['sources'][number] => Boolean(s));
  console.log(`[city] destinations: ${destinations.length}`);
  return { destinations, sources };
}

const destinations = buildDestinationsResponse();

export const cityData = {
  timpark: () => timpark,
  timparkCount: () => timpark?.data.features.length ?? 0,
  destinations: () => destinations,
  neighbourhoodFeatures: () => neighbourhoods?.data.features ?? [],
  osmStreetList: () => osmStreets?.data.streets ?? [],
};
