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
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  type: ParkingType,
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
