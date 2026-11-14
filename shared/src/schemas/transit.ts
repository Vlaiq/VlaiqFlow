import { z } from 'zod';
import { Coordinate } from './navigation';

const id = z.string().min(1).max(512);
export const TransitTimestamp = z.string().datetime({ offset: true });
export const ServiceDate = z.string().regex(/^\d{8}$/).refine((s) => {
  const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T12:00:00Z`);
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10).replaceAll('-', '') === s;
}, 'Invalid GTFS date');
const flag = z.number().int().min(0).max(2).nullable();
const Acquisition = z.enum(['publisher_download', 'user_supplied_archive']);
export const TransitArchiveProvenance = z.object({
  source: z.literal('https://smtt.ro/transit/gtfs/maps/smtt-timisoara-ro.zip'),
  fetchedAt: TransitTimestamp.nullable(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  archiveBytes: z.number().int().positive().max(64 * 1024 * 1024),
  acquisition: Acquisition.default('publisher_download'), originalFileName: z.string().min(1).max(512).optional(),
}).strict().refine((p) => p.fetchedAt !== null || p.acquisition === 'user_supplied_archive',
  'Publisher download requires its actual retrieval timestamp');
export const TransitStop = z.object({
  id, name: z.string().min(1), coordinate: Coordinate.nullable(),
  parentStation: id.nullable(), locationType: z.number().int().min(0).max(4), wheelchairBoarding: flag,
}).strict();
export type TransitStop = z.infer<typeof TransitStop>;
export const TransitRoute = z.object({
  id, agencyId: id, shortName: z.string(), longName: z.string(), type: z.number().int().nonnegative(),
}).strict();
export type TransitRoute = z.infer<typeof TransitRoute>;
export const TransitTrip = z.object({
  id, routeId: id, serviceId: id, headsign: z.string().nullable(),
  directionId: z.union([z.literal(0), z.literal(1)]).nullable(),
  wheelchairAccessible: flag, bikesAllowed: flag, shapeId: id.nullable(),
}).strict();
export type TransitTrip = z.infer<typeof TransitTrip>;
export const TransitCalendar = z.object({
  serviceId: id, startDate: ServiceDate, endDate: ServiceDate,
  /** Monday first. */
  weekdays: z.tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean(), z.boolean(), z.boolean(), z.boolean()]),
}).strict();
export const TransitException = z.object({
  serviceId: id, date: ServiceDate, type: z.union([z.literal(1), z.literal(2)]),
}).strict();
export const TransitFeedMetadata = z.object({
  source: z.string().url(), fetchedAt: TransitTimestamp.nullable(), version: z.string().nullable(),
  ingestedAt: TransitTimestamp.optional(), acquisition: Acquisition.optional(), originalFileName: z.string().optional(),
  publisher: z.object({ name: z.string().min(1), url: z.string().url(), language: z.string().min(1) }).strict().optional(),
  attributions: z.array(z.object({ organizationName: z.string().min(1), url: z.string().url().nullable(),
    isProducer: z.boolean(), isOperator: z.boolean(), isAuthority: z.boolean() }).strict()).optional(),
  validFrom: ServiceDate, validUntil: ServiceDate,
  agencies: z.array(z.object({ id, name: z.string().min(1), timezone: z.string().min(1) }).strict()).min(1).max(64),
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), archiveBytes: z.number().int().positive(),
  license: z.string().min(1), quality: z.enum(['confirmed', 'simulated']),
  validation: z.object({ warnings: z.array(z.string()), files: z.array(z.string()),
    counts: z.object({ stops: z.number().int().nonnegative(), routes: z.number().int().nonnegative(),
      trips: z.number().int().nonnegative(), stopTimes: z.number().int().nonnegative() }).strict(),
  }).strict(),
}).strict();
export type TransitFeedMetadata = z.infer<typeof TransitFeedMetadata>;
// Columnar tuples reduce snapshot size; both arrival and departure plus stop order survive.
export const TransitStopTime = z.tuple([
  id, id, z.number().int().nonnegative(), z.number().int().min(0).max(604799).nullable(),
  z.number().int().min(0).max(604799).nullable(), z.number().int().min(0).max(3),
  z.number().int().min(0).max(3), z.string().nullable(),
  z.union([z.literal(0), z.literal(1)]).optional(),
]);
export type TransitStopTime = z.infer<typeof TransitStopTime>;
export const TransitDigest = z.object({
  schemaVersion: z.literal(1), metadata: TransitFeedMetadata,
  stops: z.array(TransitStop).min(1).max(50000), routes: z.array(TransitRoute).min(1).max(10000), trips: z.array(TransitTrip).min(1).max(100000),
  stopTimes: z.array(TransitStopTime).min(1).max(1000000), calendars: z.array(TransitCalendar).max(100000), exceptions: z.array(TransitException).max(1000000),
}).strict();
export type TransitDigest = z.infer<typeof TransitDigest>;
export const ScheduledDeparture = z.object({
  id, stopId: id, tripId: id, routeId: id, serviceId: id, serviceDate: ServiceDate,
  stopSequence: z.number().int().nonnegative(), departureSeconds: z.number().int().nonnegative(),
  scheduledAt: TransitTimestamp, routeShortName: z.string(), headsign: z.string().nullable(),
  directionId: z.union([z.literal(0), z.literal(1)]).nullable(),
  quality: z.enum(['confirmed', 'simulated']), source: z.string().url(), feedVersion: z.string().nullable(),
  timepoint: z.union([z.literal(0), z.literal(1)]).optional(),
}).strict();
export type ScheduledDeparture = z.infer<typeof ScheduledDeparture>;
export const WalkingAccess = z.object({
  mode: z.literal('walk'), profile: z.literal('foot-walking'), from: Coordinate, to: Coordinate,
  geometry: z.array(Coordinate).min(2).max(100000), distanceMeters: z.number().finite().min(0).max(100000),
  durationSeconds: z.number().finite().min(0).max(86400), source: z.string().min(1),
  quality: z.enum(['estimated', 'simulated']), calculatedAt: TransitTimestamp,
}).strict();
export type WalkingAccess = z.infer<typeof WalkingAccess>;
export const BioPacerRequest = z.object({
  origin: Coordinate, stopId: id.optional(), startAt: TransitTimestamp,
  routeId: id.optional(), directionId: z.union([z.literal(0), z.literal(1)]).optional(),
  connectionBufferSeconds: z.number().finite().min(0).max(3600).default(120),
  comfortableSpeedKmh: z.number().finite().min(0.1).max(8).default(4),
  briskMultiplier: z.number().finite().min(1).max(1.5).default(1.2),
  radiusMeters: z.number().finite().min(1).max(3000).default(1200),
  candidateLimit: z.number().int().min(1).max(5).default(3),
  departureLimit: z.number().int().min(1).max(20).default(8),
  horizonSeconds: z.number().int().min(60).max(86400).default(7200),
}).strict();
export type BioPacerRequest = z.infer<typeof BioPacerRequest>;
export const TransitUnavailableReason = z.enum([
  'INVALID_INPUT', 'GTFS_UNAVAILABLE', 'GTFS_INVALID', 'EXPIRED_FEED', 'UNSUPPORTED_DATE',
  'NO_NEARBY_STOP', 'NO_DEPARTURE', 'WALKING_UNAVAILABLE', 'WALKING_TIMEOUT', 'INVALID_WALKING_ROUTE',
]);
export type TransitUnavailableReason = z.infer<typeof TransitUnavailableReason>;
export const FeasibilityCategory = z.enum(['COMFORTABLE', 'BRISK', 'TOO_TIGHT', 'MISSED', 'UNKNOWN']);
export const BioPacerOption = z.object({
  departure: ScheduledDeparture, walking: WalkingAccess.nullable(),
  availableSeconds: z.number().finite(), remainingSeconds: z.number().finite(),
  requiredSpeedKmh: z.number().finite().nonnegative().nullable(),
  estimatedWalkSeconds: z.number().finite().nonnegative().nullable(),
  category: FeasibilityCategory, explanation: z.string(),
}).strict();
export type BioPacerOption = z.infer<typeof BioPacerOption>;
export const BioPacerResult = z.object({
  status: z.enum(['ok', 'unavailable']), reason: TransitUnavailableReason.nullable(),
  options: z.array(BioPacerOption).max(100), recommendedDepartureId: id.nullable(),
  stops: z.array(TransitStop).max(5), requestedStartAt: TransitTimestamp.nullable(), evaluatedStartAt: TransitTimestamp.nullable(),
  recommendation: z.enum(['COMFORTABLE', 'NEXT_DEPARTURE_RECOMMENDED', 'NONE']),
  feed: TransitFeedMetadata.nullable(), calculatedAt: TransitTimestamp,
  quality: z.object({ schedule: z.enum(['confirmed', 'simulated', 'unknown']),
    walking: z.enum(['estimated', 'simulated', 'unknown']), feasibility: z.enum(['estimated', 'simulated', 'unknown']),
    liveService: z.literal('unknown') }).strict(),
  failures: z.array(z.object({ stopId: id, reason: TransitUnavailableReason }).strict()).max(5),
  limitations: z.array(z.string()),
}).strict();
export type BioPacerResult = z.infer<typeof BioPacerResult>;
