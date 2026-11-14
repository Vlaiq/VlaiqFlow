import { z } from 'zod';
import { Coordinate } from './navigation';
import { DataQuality } from './quality';
import { TariffColor } from './timpark';
import { ProtectedZone, SchoolZoneMode } from './protectedZone';

/**
 * SmartMatch parking recommendation (spec §7). Every number here is computed by deterministic code in
 * backend/src/engines/smartmatch; nothing is produced by an AI model.
 */

/** balanced = default; cheap = money weighs more; sure = a full parking costs more (risk-averse). */
export const RecommendationMode = z.enum(['balanced', 'cheap', 'sure', 'less_walk']);
export type RecommendationMode = z.infer<typeof RecommendationMode>;

export const RecommendationRequest = z.object({
  destination: Coordinate,
  /** Only an explicitly selected GPS/manual origin; never an implicit demo origin. */
  origin: Coordinate.optional(),
  /** Arrival time; defaults to now on the server. */
  arriveAt: z.string().datetime({ offset: true }).optional(),
  stayMinutes: z.number().int().min(15).max(600).default(120),
  mode: RecommendationMode.default('balanced'),
  maxWalkMinutes: z.number().int().min(2).max(20).default(12),
  /** School drop-off zones (§6.16): 'auto' applies them at school times, 'off' for this trip. */
  schoolZone: SchoolZoneMode.default('auto'),
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
  drive: z.object({ minutes: z.number().nonnegative().nullable(), meters: z.number().nonnegative().nullable(), quality: DataQuality, source: z.string() }).optional(),
  journeyMinutes: z.number().nonnegative().nullable().optional(),
  pFree: z.object({
    value: z.number().min(0).max(1),
    quality: DataQuality, // 'estimated' for the rule model; never 'confirmed' without a live source
    source: z.string(),
    profile: AreaProfile,
    expectedOccupancy: z.number().min(0).max(1),
    /** Sensitivity band [pessimistic, optimistic] if the typical occupancy is off by ±10 points. */
    range: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
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
  /** Present when a school or kindergarten is next to the destination (§6.16). */
  protectedZone: ProtectedZone.nullable().optional(),
});
export type RecommendationResponse = z.infer<typeof RecommendationResponse>;

const DayCurve = z.array(z.number().min(0).max(1)).length(24);

/** The availability rule model exactly as the backend runs it, published for the "Date parcări" page. */
export const AvailabilityModelResponse = z.object({
  name: z.string(),
  version: z.string(),
  quality: z.literal('estimated'),
  calibrated: z.boolean(),
  params: z.object({
    kappaKnown: z.number(),
    kappaUnknown: z.number(),
    defaultCapacity: z.number(),
    findableShare: z.number(),
    pMin: z.number(),
    pMax: z.number(),
    curveError: z.number(),
    m2PerLotSpace: z.number(),
    mPerKerbSpace: z.number(),
    maxKerbCountedM: z.number(),
  }),
  profiles: z.array(
    z.object({
      id: AreaProfile,
      label: z.string(),
      rule: z.string(),
      curves: z.object({ weekday: DayCurve, saturday: DayCurve, sunday: DayCurve }),
    }),
  ),
});
export type AvailabilityModelResponse = z.infer<typeof AvailabilityModelResponse>;

/** One availability calculation, step by step, for the "Cum calculăm șansele" page. */
export const AvailabilityExplainRequest = z.object({
  profile: AreaProfile,
  at: z.string().datetime({ offset: true }),
  /** Number of spaces; omitted = unknown. */
  capacity: z.coerce.number().int().min(1).max(5000).optional(),
});
export type AvailabilityExplainRequest = z.infer<typeof AvailabilityExplainRequest>;

export const AvailabilityExplainResponse = z.object({
  profile: AreaProfile,
  at: z.string(),
  capacity: z.number().int().nullable(),
  quality: z.literal('estimated'),
  detail: z.object({
    day: z.enum(['weekday', 'saturday', 'sunday']),
    hour: z.number().int(),
    minute: z.number().int(),
    holiday: z.string().nullable(),
    expected: z.number(),
    known: z.boolean(),
    capacityUsed: z.number().int(),
    kappa: z.number(),
    alpha: z.number(),
    beta: z.number(),
    spread: z.number(),
    needed: z.number().int(),
    raw: z.number(),
    value: z.number(),
    clamped: z.boolean(),
    range: z.tuple([z.number(), z.number()]),
  }),
  factors: z.array(z.string()),
  /** The same parking at every full hour of that local day. */
  dayCurve: z.array(z.object({ hour: z.number().int(), expected: z.number(), value: z.number(), low: z.number(), high: z.number() })).length(24),
});
export type AvailabilityExplainResponse = z.infer<typeof AvailabilityExplainResponse>;
