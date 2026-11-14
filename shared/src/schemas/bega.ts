import { z } from 'zod';
import { Coordinate } from './navigation';

/** Local metric geometry domain, not a claim of citywide infrastructure coverage. */
export const BegaCoordinate = Coordinate.refine(
  ([lng, lat]) => lng >= 21 && lng <= 21.5 && lat >= 45.6 && lat <= 45.9,
  'Bega coverage requires [longitude, latitude] in the Timișoara prototype area',
);
export const BegaMode = z.enum(['walk', 'cycle']);
export type BegaMode = z.infer<typeof BegaMode>;
export const BegaInfrastructure = z.enum([
  'pedestrian_path', 'cycling_path', 'shared_use_path', 'unknown',
]);
export type BegaInfrastructure = z.infer<typeof BegaInfrastructure>;
const text = z.string().min(1).max(1000);
const osmRef = z.string().regex(/^way\/\d+$/);
export const BegaLine = z.array(BegaCoordinate).min(2).max(12000);
export const BegaRoute = z.object({
  mode: BegaMode,
  geometry: BegaLine,
  distanceMeters: z.number().finite().positive().max(100000),
  durationSeconds: z.number().finite().positive().max(86400),
  source: z.string().min(1).max(300),
  quality: z.literal('estimated'),
}).strict();
export type BegaRoute = z.infer<typeof BegaRoute>;
export const BegaRequest = z.object({
  origin: BegaCoordinate,
  destination: BegaCoordinate,
  mode: BegaMode,
  maxExtraTimeSeconds: z.number().finite().min(0).max(900).optional(),
  maxTimeRatio: z.number().finite().min(1).max(1.5).optional(),
}).strict();
export type BegaRequest = z.infer<typeof BegaRequest>;
export const BegaCorridorFeature = z.object({
  type: z.literal('Feature'),
  geometry: z.object({ type: z.literal('LineString'), coordinates: BegaLine }).strict(),
  properties: z.object({
    osmId: osmRef,
    osmVersion: z.number().int().positive().safe(),
    osmTimestamp: z.string().datetime(),
    tags: z.record(z.string().max(1000)).refine((v) => Object.keys(v).length <= 100),
    nodeIds: z.array(z.number().int().positive().safe()).min(2).max(12000),
    modes: z.array(BegaMode).min(1).max(2),
    infrastructure: BegaInfrastructure,
    source: text,
  }).strict(),
}).strict().superRefine((f, ctx) => {
  if (f.properties.nodeIds.length !== f.geometry.coordinates.length)
    ctx.addIssue({ code: 'custom', message: 'OSM node identities must match original geometry vertices' });
  const { modes, tags, infrastructure } = f.properties;
  if (new Set(modes).size !== modes.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate travel modes' });
  const expected = modes.length === 2 ? 'shared_use_path' : tags.highway === 'cycleway' ?
    'cycling_path' : tags.highway === 'footway' ? 'pedestrian_path' : 'unknown';
  if (infrastructure !== expected)
    ctx.addIssue({ code: 'custom', message: 'Infrastructure classification contradicts mapping tags and declared modes' });

});
export const BegaDataset = z.object({
  type: z.literal('FeatureCollection'),
  metadata: z.object({
    snapshotVersion: text,
    extractedAt: z.string().datetime(),
    osmBaseTimestamp: z.string().datetime().nullable(),
    source: text,
    license: z.literal('ODbL-1.0'),
    attribution: text,
    bbox: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
    limitations: z.array(text).max(30),
    status: z.enum(['available', 'blocked']),
    querySha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  features: z.array(BegaCorridorFeature).max(400),
}).strict().superRefine((d, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (d.features.reduce((n, f) => n + f.geometry.coordinates.length, 0) > 12000)
    fail('Corridor vertex budget exceeded');
  if (new Set(d.features.map((f) => f.properties.osmId)).size !== d.features.length)
    fail('Duplicate OSM ways');
  if (d.metadata.status === 'blocked' && d.features.length) fail('Blocked dataset cannot contain production features');
  const [w, s, e, n] = d.metadata.bbox;
  if (w < 21 || e > 21.5 || s < 45.6 || n > 45.9 || w >= e || s >= n) fail('Invalid local dataset bbox');
  const nodes = new Map<number, string>();
  for (const f of d.features) f.geometry.coordinates.forEach((p, i) => {
    if (p[0] < w || p[0] > e || p[1] < s || p[1] > n) fail('Geometry outside extraction bbox');
    const id = f.properties.nodeIds[i]!;
    const key = JSON.stringify(p);
    if (nodes.has(id) && nodes.get(id) !== key) fail('Conflicting OSM node geometry');
    nodes.set(id, key);
  });
});
export type BegaDataset = z.infer<typeof BegaDataset>;
const anchor = z.object({ nodeId: z.number().int().positive().safe(), coordinate: BegaCoordinate, osmIds: z.array(osmRef).min(1).max(400) }).strict();
const overlapPart = z.object({
  type: z.literal('Feature'),
  geometry: z.object({ type: z.literal('LineString'), coordinates: BegaLine }).strict(),
  properties: z.object({ osmIds: z.array(osmRef).min(1).max(400), infrastructureTypes: z.array(BegaInfrastructure).min(1).max(4) }).strict(),
}).strict();
const alternative = z.object({
  mode: BegaMode,
  /** Provider segments remain separate: never draw a synthetic connector. */
  segments: z.array(BegaRoute).length(3),
  geometry: z.object({ type: z.literal('MultiLineString'), coordinates: z.array(BegaLine).length(3) }).strict(),
  source: text,
  quality: z.literal('estimated'),
  distanceMeters: z.number().finite().positive(),
  durationSeconds: z.number().finite().positive(),
  corridorMeters: z.number().finite().positive(),
  corridorShare: z.number().finite().min(0).max(1),
  baselineCorridorMeters: z.number().finite().nonnegative(),
  deltaDistanceMeters: z.number().finite(),
  deltaTimeSeconds: z.number().finite(),
  timeRatio: z.number().finite().positive(),
  joinGapsMeters: z.tuple([z.number().finite().min(0).max(1), z.number().finite().min(0).max(1)]),
  infrastructureTypes: z.array(BegaInfrastructure).min(1).max(4),
  entry: anchor,
  exit: anchor,
  overlap: z.object({ type: z.literal('FeatureCollection'), features: z.array(overlapPart).min(1).max(24000) }).strict(),
}).strict();
const common = {
  baseline: BegaRoute.nullable(),
  calculatedAt: z.string().datetime(),
  reason: text,
  explanation: text,
  integrity: z.object({
    quality: z.literal('estimated'),
    mappingQuality: z.literal('osm_contributed'),
    measurementQuality: z.literal('derived_geometric_approximation'),
    dataSources: z.array(text).max(10),
    corridorSnapshotDate: z.string().datetime().nullable(),
    corridorSnapshotVersion: text.nullable(),
    routingProvider: z.string().min(1).max(1500).nullable(),
    assumptions: z.array(text).max(20),
    limitations: z.array(text).max(50),
  }).strict(),
};
export const BegaResponse = z.discriminatedUnion('status', [
  z.object({ ...common, status: z.literal('available'), baseline: BegaRoute, alternative }).strict(),
  z.object({ ...common, status: z.literal('not_relevant'), alternative: z.null() }).strict(),
  z.object({ ...common, status: z.literal('no_valid_alternative'), alternative: z.null() }).strict(),
  z.object({ ...common, status: z.literal('provider_unavailable'), alternative: z.null() }).strict(),
  z.object({ ...common, status: z.literal('data_unavailable'), alternative: z.null() }).strict(),
]).superRefine((r, ctx) => {
  if (r.status !== 'available') return;
  const a = r.alternative;
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const equal = (x: number, y: number) => Math.abs(x - y) < 1e-6;
  if (!equal(a.distanceMeters, a.segments.reduce((n, s) => n + s.distanceMeters, 0)) ||
      !equal(a.durationSeconds, a.segments.reduce((n, s) => n + s.durationSeconds, 0))) fail('Totals differ from provider segments');
  if (!equal(a.deltaDistanceMeters, a.distanceMeters - r.baseline.distanceMeters) ||
      !equal(a.deltaTimeSeconds, a.durationSeconds - r.baseline.durationSeconds) ||
      !equal(a.timeRatio, a.durationSeconds / r.baseline.durationSeconds) ||
      !equal(a.corridorShare, a.corridorMeters / a.distanceMeters)) fail('Inconsistent comparison metrics');
  if (a.corridorMeters > a.distanceMeters || a.segments.some((s) => s.mode !== r.baseline.mode) || a.mode !== r.baseline.mode)
    fail('Invalid overlap or travel mode');
  if (JSON.stringify(a.geometry.coordinates) !== JSON.stringify(a.segments.map((s) => s.geometry))) fail('Geometry differs from provider segments');
});
export type BegaResponse = z.infer<typeof BegaResponse>;
