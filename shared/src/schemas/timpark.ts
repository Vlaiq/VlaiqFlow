import { z } from 'zod';

/** Shape of https://cont.primariatm.ro/api/mobile/parking as observed on 13 Nov 2026 (spec §5.2). */

const LngLat = z.tuple([z.number(), z.number()]); // [lng, lat]

export const TariffColor = z.enum(['green', 'red', 'yellow', 'blue']);
export type TariffColor = z.infer<typeof TariffColor>;

export const TimparkKind = z.enum(['zone', 'lot', 'street']);
export type TimparkKind = z.infer<typeof TimparkKind>;

export const TimparkFeature = z.object({
  id: z.string(),
  kind: TimparkKind, // zone/lot = polygon ring, street = line
  name: z.string(),
  tariff: TariffColor,
  progressive: z.boolean(),
  checked: z.boolean(), // verified against the 2026 tariff annex by the City Hall
  coordinates: z.array(LngLat).min(2),
});
export type TimparkFeature = z.infer<typeof TimparkFeature>;

const SmsPrice = z.object({ code: z.string(), eur: z.number().nonnegative() });
const HourWindow = z.tuple([z.number().min(0).max(24), z.number().min(0).max(24)]);

export const TimparkTariffs = z.object({
  smsNumber: z.string(),
  hourly: z.object({ green: SmsPrice, red: SmsPrice, yellow: SmsPrice, blue: SmsPrice }),
  progressive: z.array(SmsPrice),
  day: SmsPrice.extend({ tariffs: z.array(TariffColor) }),
  coach: SmsPrice.optional(),
  schedule: z.object({
    weekdays: HourWindow,
    saturday: z.record(z.string(), HourWindow).default({}),
  }),
});
export type TimparkTariffs = z.infer<typeof TimparkTariffs>;

export const TimparkData = z.object({
  version: z.string(),
  features: z.array(TimparkFeature),
  tariffs: TimparkTariffs,
});
export type TimparkData = z.infer<typeof TimparkData>;

/** What scripts/fetch-city-data.mjs writes and GET /api/city/parking-zones returns. */
export const TimparkSnapshot = z.object({
  source: z.string().url(),
  fetchedAt: z.string(),
  data: TimparkData,
});
export type TimparkSnapshot = z.infer<typeof TimparkSnapshot>;
