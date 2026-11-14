import { z } from 'zod';

/** Snapshots written by scripts/fetch-city-data.mjs (City Hall endpoints, see spec §5.2). */
const snapshot = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ source: z.string().url(), fetchedAt: z.string(), data });

export const RegisterStreet = z.object({
  id: z.number(),
  name: z.string(), // full official name, e.g. "Aleea Actorilor"
  current: z.string(), // name without the street type, e.g. "Actorilor"
  previous: z.string().nullable(),
  type: z.string(), // Strada, Bulevardul, Piața, … (may be empty)
  neighbourhood: z.string().nullable(), // free text in the register, not the 40 official outlines
  status: z.string(), // "Existenta" | "Dezafectata"
});
export type RegisterStreet = z.infer<typeof RegisterStreet>;
export const StreetsSnapshot = snapshot(z.object({ streets: z.array(RegisterStreet) }));
export type StreetsSnapshot = z.infer<typeof StreetsSnapshot>;

export const Poi = z.object({
  id: z.string(),
  name: z.string(),
  nameEn: z.string().nullable(),
  address: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
});
export type Poi = z.infer<typeof Poi>;
export const PoisSnapshot = snapshot(z.object({ pois: z.array(Poi) }));
export type PoisSnapshot = z.infer<typeof PoisSnapshot>;

const Ring = z.array(z.tuple([z.number(), z.number()]));
export const NeighbourhoodFeature = z.object({
  type: z.literal('Feature'),
  properties: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
  geometry: z.union([
    z.object({ type: z.literal('Polygon'), coordinates: z.array(Ring) }),
    z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(Ring)) }),
  ]),
});
export type NeighbourhoodFeature = z.infer<typeof NeighbourhoodFeature>;
export const NeighbourhoodsSnapshot = snapshot(
  z.object({ type: z.literal('FeatureCollection'), features: z.array(NeighbourhoodFeature) }),
);
export type NeighbourhoodsSnapshot = z.infer<typeof NeighbourhoodsSnapshot>;

// ---- OpenStreetMap snapshots (scripts/fetch-osm-places.mjs) ------------------------------------------

const osmSnapshot = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ source: z.string(), fetchedAt: z.string(), attribution: z.string(), data });

export const OsmStreet = z.object({ name: z.string(), points: z.array(z.tuple([z.number(), z.number()])) });
export type OsmStreet = z.infer<typeof OsmStreet>;
export const OsmStreetsSnapshot = osmSnapshot(z.object({ streets: z.array(OsmStreet) }));
export type OsmStreetsSnapshot = z.infer<typeof OsmStreetsSnapshot>;

export const PlaceCategory = z.enum(['mall', 'station', 'bus_station', 'hospital', 'university', 'stadium', 'park', 'school', 'kindergarten']);
export type PlaceCategory = z.infer<typeof PlaceCategory>;
export const OsmPlace = z.object({ id: z.string(), name: z.string(), category: PlaceCategory, lat: z.number(), lng: z.number() });
export type OsmPlace = z.infer<typeof OsmPlace>;
export const OsmPlacesSnapshot = osmSnapshot(z.object({ places: z.array(OsmPlace) }));
export type OsmPlacesSnapshot = z.infer<typeof OsmPlacesSnapshot>;

/** Schools and kindergartens (scripts/fetch-osm-schools.mjs). The name can be missing in OSM. */
export const OsmSchool = z.object({
  id: z.string(),
  name: z.string().nullable(),
  kind: z.enum(['school', 'kindergarten']),
  lat: z.number(),
  lng: z.number(),
});
export type OsmSchool = z.infer<typeof OsmSchool>;
export const OsmSchoolsSnapshot = osmSnapshot(z.object({ schools: z.array(OsmSchool) }));
export type OsmSchoolsSnapshot = z.infer<typeof OsmSchoolsSnapshot>;

// ---- Destinations served to the app -------------------------------------------------------------

export const DestinationKind = z.enum(['landmark', 'place', 'street', 'neighbourhood']);
export type DestinationKind = z.infer<typeof DestinationKind>;

/** How precisely we know where the destination is. Shown to the user. */
export const LocationPrecision = z.enum(['exact', 'street', 'neighbourhood', 'none']);
export type LocationPrecision = z.infer<typeof LocationPrecision>;

export const Destination = z.object({
  id: z.string(),
  kind: DestinationKind,
  name: z.string(),
  nameEn: z.string().nullable(),
  detail: z.string().nullable(), // neighbourhood, address or previous name
  category: PlaceCategory.nullable().default(null), // for kind = place
  aliases: z.array(z.string()), // extra names to search (previous name, English name)
  location: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  precision: LocationPrecision,
  locationSource: z.string(),
});
export type Destination = z.infer<typeof Destination>;

export const DestinationsResponse = z.object({
  destinations: z.array(Destination),
  sources: z.array(z.object({ name: z.string(), source: z.string(), fetchedAt: z.string() })),
});
export type DestinationsResponse = z.infer<typeof DestinationsResponse>;
