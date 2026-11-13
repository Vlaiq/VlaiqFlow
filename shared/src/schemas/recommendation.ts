import { z } from 'zod';
import { Coordinate } from './navigation';
import { DataQuality } from './quality';
import { TariffColor } from './timpark';

/**
 * SmartMatch parking recommendation (spec §7). Every number here is computed by deterministic code in
 * backend/src/engines/smartmatch; nothing is produced by an AI model.
 */

/** balanced = default; cheap = money weighs more; sure = a full parking costs more (risk-averse). */
export const RecommendationMode = z.enum(['balanced', 'cheap', 'sure']);
export type RecommendationMode = z.infer<typeof RecommendationMode>;

export const RecommendationRequest = z.object({
  destination: Coordinate,
  /** Arrival time; defaults to now on the server. */
  arriveAt: z.string().datetime({ offset: true }).optional(),
  stayMinutes: z.number().int().min(15).max(600).default(120),
  mode: RecommendationMode.default('balanced'),
  maxWalkMinutes: z.number().int().min(2).max(20).default(12),
});
export type RecommendationRequest = z.infer<typeof RecommendationRequest>;

export const CandidateKind = z.enum(['timpark_lot', 'timpark_street', 'osm']);
export type CandidateKind = z.infer<typeof CandidateKind>;

/** Area profile that drives the occupancy curve (rules, spec §7.3). */
export const AreaProfile = z.enum(['centre', 'commercial', 'campus', 'hospital', 'station', 'residential']);
export type AreaProfile = z.infer<typeof AreaProfile>;

export const RecommendationOption = z.object({
  id: z.string(),
  kind: CandidateKind,
  name: z.string(),
  nameIsDerived: z.boolean(),
  coordinate: Coordinate,
  access: z.enum(['public', 'customers', 'unknown']),
  tariff: TariffColor.nullable(),
  smsCode: z.string().nullable(),
  capacity: z.object({ value: z.number().int().positive().nullable(), quality: DataQuality, source: z.string() }),
  walk: z.object({ minutes: z.number().nonnegative(), meters: z.number().nonnegative(), quality: DataQuality, source: z.string() }),
  pFree: z.object({
    value: z.number().min(0).max(1),
    quality: DataQuality, // 'estimated' for the rule model; never 'confirmed' without a live source
    source: z.string(),
    profile: AreaProfile,
    expectedOccupancy: z.number().min(0).max(1),
    factors: z.array(z.string()),
  }),
  price: z.object({
    total: z.number().nonnegative().nullable(), // for the whole stay; null = unknown
    currency: z.string().nullable(),
    paidMinutes: z.number().int().nonnegative().nullable(),
    quality: DataQuality,
    source: z.string(),
    note: z.string(),
  }),
  /** The ranking cost in minutes: walk + (1 − pFree) × fullPenalty + price × minutesPerCurrency. Lower wins. */
  cost: z.object({ total: z.number(), walk: z.number(), risk: z.number(), price: z.number() }),
  flags: z.array(z.string()),
});
export type RecommendationOption = z.infer<typeof RecommendationOption>;

export const RecommendationResponse = z.object({
  arriveAt: z.string(),
  stayMinutes: z.number().int(),
  mode: RecommendationMode,
  params: z.object({ fullPenaltyMinutes: z.number(), minutesPerCurrency: z.number(), maxWalkMinutes: z.number() }),
  options: z.array(RecommendationOption), // sorted, best first
  considered: z.number().int().nonnegative(),
  explanation: z.string().nullable(),
  model: z.object({ name: z.string(), quality: DataQuality, note: z.string() }),
});
export type RecommendationResponse = z.infer<typeof RecommendationResponse>;
