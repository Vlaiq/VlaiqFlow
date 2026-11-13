import { z } from 'zod';

/** spec §5.1 — every value shown to users carries one of these. */
export const DataQuality = z.enum(['confirmed', 'estimated', 'unknown', 'simulated']);
export type DataQuality = z.infer<typeof DataQuality>;

/** A value together with where it came from and how much we trust it. */
export const sourced = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value.nullable(),
    quality: DataQuality,
    source: z.string(),
    updatedAt: z.string().datetime().optional(),
  });

export type Sourced<T> = {
  value: T | null;
  quality: DataQuality;
  source: string;
  updatedAt?: string;
};

export const unknownValue = <T>(source = 'none'): Sourced<T> => ({
  value: null,
  quality: 'unknown',
  source,
});
