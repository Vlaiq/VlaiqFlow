import { z } from 'zod';
import { sourced } from './quality';

export const ParkingType = z.enum([
  'surface',
  'multi-storey',
  'underground',
  'street_zone',
  'park_and_ride',
  'other',
]);
export type ParkingType = z.infer<typeof ParkingType>;

export const Parking = z.object({
  id: z.string(), // e.g. 'osm-way-123456'
  name: z.string(),
  // true when OSM has no name and `name` was built from the position ("Parcare lângă Strada X").
  nameIsDerived: z.boolean().default(false),
  neighbourhood: z.string().nullable().default(null), // official neighbourhood containing the parking
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  type: ParkingType,
  // OSM access tag: open to everyone, only to customers (malls, shops, hotels), or not stated.
  // access=private / no are excluded at import: those are not destinations for the public.
  access: z.enum(['public', 'customers', 'unknown']),
  operator: z.string().nullable(),
  capacity: sourced(z.number().int().nonnegative()),
  capacityDisabled: sourced(z.number().int().nonnegative()),
  price: sourced(z.object({ perHourRon: z.number().nonnegative(), note: z.string().optional() })),
  availability: sourced(z.object({ freeSpaces: z.number().int().nonnegative() })),
  source: z.string(), // provenance of the record itself
});
export type Parking = z.infer<typeof Parking>;

export const ParkingsResponse = z.object({
  parkings: z.array(Parking),
  dataset: z.object({
    source: z.string(),
    generatedAt: z.string().nullable(),
    attribution: z.string(),
  }),
});
export type ParkingsResponse = z.infer<typeof ParkingsResponse>;

/**
 * One row of the public parking register (the "Date parcări" page): every parking SmartMatch can
 * recommend, with each value next to its quality, its source and a way to check it.
 */
export const ParkingRegisterRow = z.object({
  id: z.string(),
  kind: z.enum(['timpark_lot', 'timpark_street', 'osm']),
  name: z.string(),
  nameIsDerived: z.boolean(),
  lng: z.number(),
  lat: z.number(),
  /** Human-readable source record, e.g. "OpenStreetMap way/123" or "Timpark s84". */
  sourceRef: z.string(),
  /** Public page where anyone can inspect the source record, or null when none exists. */
  sourceUrl: z.string().url().nullable(),
  access: z.enum(['public', 'customers', 'unknown']),
  /** Timpark only: the City Hall checked the geometry against the 2026 tariff annex. */
  checked: z.boolean().nullable(),
  tariff: z.enum(['green', 'red', 'yellow', 'blue']).nullable(),
  capacity: sourced(z.number().int().nonnegative()),
  /** First paid hour inside the schedule, in the published unit; 0 = free. */
  hourly: z.object({
    value: z.number().nonnegative().nullable(),
    currency: z.string().nullable(),
    quality: z.enum(['confirmed', 'estimated', 'unknown', 'simulated']),
    source: z.string(),
    note: z.string(),
  }),
  /** Area profile that picks the occupancy curve of the availability model. */
  profile: z.enum(['centre', 'commercial', 'campus', 'hospital', 'station', 'residential']),
  /** Set when an OSM parking lies inside a Timpark lot: SmartMatch then uses only the Timpark lot. */
  duplicateOf: z.string().nullable(),
  flags: z.array(z.string()),
});
export type ParkingRegisterRow = z.infer<typeof ParkingRegisterRow>;

export const ParkingRegisterResponse = z.object({
  generatedAt: z.string(),
  timpark: z.object({ source: z.string(), fetchedAt: z.string(), version: z.string() }).nullable(),
  osm: z.object({ source: z.string(), generatedAt: z.string().nullable(), attribution: z.string() }),
  rows: z.array(ParkingRegisterRow),
});
export type ParkingRegisterResponse = z.infer<typeof ParkingRegisterResponse>;
