import { z } from 'zod';
import {
  BegaDataset, BegaRequest, BegaResponse, BegaRoute,
  type BegaInfrastructure,
} from '../../../../shared/src/schemas/bega';
import { distanceM } from '../../../../shared/src/geo';
import type { Coordinate } from '../../../../shared/src/schemas/navigation';
import type { BegaRouteProvider } from './begaAdapter';
import { discoverBegaCandidates, eligibleForMode } from './begaCandidates';
import { lineLengthMeters, nearestOnLine, measureCorridorOverlap } from './begaGeometry';

/** Prototype product thresholds, not official transport/safety recommendations. */
export const BegaPolicy = z.object({
  maxCandidates: z.number().int().min(1).max(2).default(2),
  maxAccessMeters: z.number().min(50).max(1500).default(1000),
  minJourneyMeters: z.number().min(50).max(500).default(300),
  minCorridorMeters: z.number().min(100).max(1000).default(250),
  minCorridorShare: z.number().min(0.1).max(0.8).default(0.2),
  minOverlapGainMeters: z.number().min(25).max(500).default(100),
  maxTimeRatio: z.number().min(1).max(1.5).default(1.35),
  maxDistanceRatio: z.number().min(1).max(1.5).default(1.35),
  maxExtraTimeSeconds: z.number().min(0).max(900).default(300),
  overlapToleranceMeters: z.number().min(1).max(8).default(6),
  maxHeadingDeviationDegrees: z.number().min(5).max(25).default(20),
  endpointSnapMeters: z.number().min(1).max(50).default(30),
  corridorSnapMeters: z.number().min(1).max(15).default(10),
  joinToleranceMeters: z.number().min(0).max(1).default(0.25),
  providerTimeoutMs: z.number().int().min(10).max(15000).default(12000),
  cacheEntries: z.number().int().min(0).max(64).default(32),
  cacheTtlMs: z.number().int().min(0).max(60000).default(60000),
}).strict();
export type BegaPolicy = z.infer<typeof BegaPolicy>;
export type BegaEngineOptions = {
  routeProvider: BegaRouteProvider;
  corridorData: unknown;
  policy?: z.input<typeof BegaPolicy>;
  now?: () => number;
};
export type BegaCalculationOptions = { baseline?: unknown; signal?: AbortSignal };
class RoutingFailure extends Error {}
const limitations = [
  'Date OSM contribuite, fără verificare municipală sau inspecție pe teren.',
  'Durate și distanțe estimate de furnizor; suprapunere derivată geometric, fără confirmarea identității muchiilor furnizorului.',
  'Nu certifică siguranța, iluminatul, accesibilitatea ori continuitatea fizică actuală. Fără estimări de poluare.',
];
const explain: Record<Exclude<BegaResponse['status'], 'available'>, string> = {
  data_unavailable: 'Datele verificabile pentru coridorul Bega nu sunt disponibile momentan.',
  not_relevant: 'Nu am identificat o alternativă practică pe infrastructura cartografiată de lângă Bega pentru acest drum.',
  no_valid_alternative: 'Nu am găsit o alternativă Bega conectată, cu suprapunere suficientă și ocol acceptabil.',
  provider_unavailable: 'Furnizorul nu a returnat acum toate segmentele valide necesare comparației.',
};
function validateRoute(value: unknown, mode: BegaRequest['mode'], from: Coordinate, to: Coordinate, snap: number): BegaRoute {
  const parsed = BegaRoute.safeParse(value);
  if (!parsed.success || parsed.data.mode !== mode) throw new RoutingFailure('invalid_response');
  const r = parsed.data;
  const meters = lineLengthMeters(r.geometry);
  if (!Number.isFinite(meters) || meters <= 0 ||
      Math.abs(meters - r.distanceMeters) > Math.max(20, r.distanceMeters * 0.08) ||
      r.geometry.some((p, i) => i > 0 && distanceM(p, r.geometry[i - 1]!) > 1000))
    throw new RoutingFailure('invalid_geometry_metrics');
  if (distanceM(r.geometry[0]!, from) > snap || distanceM(r.geometry.at(-1)!, to) > snap)
    throw new RoutingFailure('endpoint_mismatch');
  return r;
}
function availableExplanation(extra: number, meters: number): string {
  const time = Math.abs(extra) < 30 ? 'are aproximativ aceeași durată' :
    extra > 0 ? `adaugă aproximativ ${Math.round(extra / 60)} minute` :
      `durează cu aproximativ ${Math.round(-extra / 60)} minute mai puțin`;
  return `Alternativa Bega ${time} și urmează aproximativ ${(meters / 1000).toFixed(1).replace('.', ',')} km de infrastructură cartografiată lângă canal. Suprapunere estimată geometric.`;
}
/**
 * One engine per provider + immutable snapshot. No global app wiring. At most four analyses,
 * one active provider call and eight queued calls per engine. Caches contain locations for <=60s.
 */
export function createBegaEngine(options: BegaEngineOptions) {
  const policy = BegaPolicy.parse(options.policy ?? {});
  const now = options.now ?? Date.now;
  const parsedData = BegaDataset.safeParse(options.corridorData);
  const data = parsedData.success ? parsedData.data : null;
  const cache = new Map<string, { expires: number; route: BegaRoute; timer: ReturnType<typeof setTimeout> }>();
  const removeCached = (key: string) => {
    const record = cache.get(key);
    if (record) clearTimeout(record.timer);
    cache.delete(key);
  };
  type PendingRoute = { job: Promise<BegaRoute>; controller: AbortController; consumers: number; settled: boolean };
  const pending = new Map<string, PendingRoute>();
  let analyses = 0;
  let active = false;
  const queue: (() => void)[] = [];
  function acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(new RoutingFailure('cancelled'));
    if (active && queue.length >= 8) return Promise.reject(new RoutingFailure('provider_busy'));
    return new Promise((resolve, reject) => {
      let started = false;
      const cancel = () => {
        if (started) return;
        const index = queue.indexOf(start);
        if (index >= 0) queue.splice(index, 1);
        signal.removeEventListener('abort', cancel);
        reject(new RoutingFailure('cancelled'));
      };
      const start = () => {
        started = true;
        signal.removeEventListener('abort', cancel);
        active = true;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          const next = queue.shift();
          if (next) next(); else active = false;
        });
      };
      if (active) {
        queue.push(start);
        signal.addEventListener('abort', cancel, { once: true });
      } else start();
    });
  }
  async function fetchRoute(
    mode: BegaRequest['mode'], from: Coordinate, to: Coordinate, signal?: AbortSignal,
  ): Promise<BegaRoute> {
    if (signal?.aborted) throw new RoutingFailure('cancelled');
    const key = JSON.stringify([mode, from, to]);
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return structuredClone(hit.route);
    removeCached(key);
    let entry = pending.get(key);
    if (entry?.controller.signal.aborted) { pending.delete(key); entry = undefined; }
    if (!entry) {
      if (pending.size >= 12) throw new RoutingFailure('provider_busy');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new RoutingFailure('timeout')), policy.providerTimeoutMs);
      let onAbort: () => void;
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      const work = (async () => {
        const release = await acquire(controller.signal);
        if (controller.signal.aborted) { release(); throw new RoutingFailure('cancelled'); }
        // Retain the slot until the actual adapter settles, including adapters that ignore abort.
        try { return await options.routeProvider(mode, from, to, controller.signal); }
        finally { release(); }
      })();
      const created: PendingRoute = { job: undefined!, controller, consumers: 0, settled: false };
      created.job = Promise.race([work, aborted]).then((value) => {
        if (controller.signal.aborted) throw new RoutingFailure('cancelled');
        const route = validateRoute(value, mode, from, to, policy.endpointSnapMeters);
        if (policy.cacheEntries && policy.cacheTtlMs) {
          if (cache.size >= policy.cacheEntries) removeCached(cache.keys().next().value!);
          const timer = setTimeout(() => removeCached(key), policy.cacheTtlMs);
          timer.unref?.();
          cache.set(key, { route, expires: now() + policy.cacheTtlMs, timer });
        }
        return route;
      }).finally(() => {
        created.settled = true;
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', onAbort!);
        if (pending.get(key) === created) pending.delete(key);
      });
      pending.set(key, created);
      entry = created;
    }
    const subscribed = entry;
    subscribed.consumers++;
    return new Promise<BegaRoute>((resolve, reject) => {
      let finished = false;
      const finish = (error: unknown, route?: BegaRoute) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener('abort', cancel);
        subscribed.consumers--;
        if (!subscribed.consumers && !subscribed.settled)
          subscribed.controller.abort(new RoutingFailure('cancelled'));
        if (error) reject(error); else resolve(structuredClone(route!));
      };
      const cancel = () => finish(new RoutingFailure('cancelled'));
      signal?.addEventListener('abort', cancel, { once: true });
      subscribed.job.then((route) => finish(null, route), (error) => finish(error));
      if (signal?.aborted) cancel();
    });
  }
  async function calculateBegaAlternative(input: unknown, calculation: BegaCalculationOptions = {}): Promise<BegaResponse> {
    const req = BegaRequest.parse(input); // Invalid client inputs are programmer/HTTP 400 errors.
    const calculatedAt = new Date(now()).toISOString();
    let baseline: BegaRoute | null = null;
    const integrity = () => ({
      quality: 'estimated' as const, mappingQuality: 'osm_contributed' as const,
      measurementQuality: 'derived_geometric_approximation' as const,
      dataSources: data ? [data.metadata.source, data.metadata.attribution] : [],
      corridorSnapshotDate: data?.metadata.osmBaseTimestamp ?? null,
      corridorSnapshotVersion: data?.metadata.snapshotVersion ?? null,
      routingProvider: baseline?.source ?? null,
      assumptions: [
        `Tolerance suprapunere ${policy.overlapToleranceMeters} m; abatere direcție ≤${policy.maxHeadingDeviationDegrees}°.`,
        `Continuitate între segmente în toleranță de ${policy.joinToleranceMeters} m; geometria rămâne separată, fără conectori inventați.`,
      ],
      limitations: [...limitations, ...(data?.metadata.limitations ?? [])],
    });
    const fail = (status: Exclude<BegaResponse['status'], 'available'>, reason: string): BegaResponse =>
      BegaResponse.parse({ status, reason, baseline, alternative: null, calculatedAt, explanation: explain[status], integrity: integrity() });
    if (!data || data.metadata.status !== 'available' || !data.features.length)
      return fail('data_unavailable', data ? 'corridor_snapshot_unavailable' : 'invalid_corridor_dataset');
    if (analyses >= 4) return fail('provider_unavailable', 'analysis_busy');
    analyses++;
    try {
      if (calculation.signal?.aborted) return fail('provider_unavailable', 'cancelled');
      if (calculation.baseline !== undefined)
        baseline = validateRoute(calculation.baseline, req.mode, req.origin, req.destination, policy.endpointSnapMeters);
      if (distanceM(req.origin, req.destination) < policy.minJourneyMeters)
        return fail('not_relevant', 'journey_too_short');
      // Cheap lower bound before any provider work: both endpoints need plausible corridor access.
      const eligible = data.features.filter((f) => eligibleForMode(f, req.mode));
      const nearby = [req.origin, req.destination].every((p) =>
        eligible.some((f) =>
          nearestOnLine(p, f.geometry.coordinates).distanceMeters <= policy.maxAccessMeters));
      if (!nearby) return fail('not_relevant', 'outside_corridor_access_range');
      baseline ??= await fetchRoute(req.mode, req.origin, req.destination, calculation.signal);
      const found = discoverBegaCandidates(req, data, baseline.distanceMeters, policy);
      if (!found.eligibleFeatures.length || !found.candidates.length) return fail('not_relevant', 'no_connected_relevant_candidates');
      const features = found.eligibleFeatures.map((f) => ({
        id: f.properties.osmId, coordinates: f.geometry.coordinates, infrastructure: f.properties.infrastructure,
      }));
      const overlapOptions = {
        toleranceMeters: policy.overlapToleranceMeters,
        maxHeadingDeviationDegrees: policy.maxHeadingDeviationDegrees,
        maxSegmentComparisons: 1000000,
      };
      const baseOverlap = measureCorridorOverlap(baseline.geometry, features, overlapOptions);
      if (!baseOverlap) return fail('no_valid_alternative', 'overlap_unknown');
      const valid: { id: string; value: Extract<BegaResponse, { status: 'available' }>['alternative'] }[] = [];
      let providerFailed = false;
      for (const candidate of found.candidates) {
        if (calculation.signal?.aborted) return fail('provider_unavailable', 'cancelled');
        const points = [req.origin, candidate.entry.coordinate, candidate.exit.coordinate, req.destination];
        const segments: BegaRoute[] = [];
        try {
          for (let i = 0; i < 3; i++) {
            const segment = await fetchRoute(req.mode, points[i]!, points[i + 1]!, calculation.signal);
            // Corridor anchors have tighter snaps than user's origin/destination.
            if ((i > 0 && distanceM(segment.geometry[0]!, points[i]!) > policy.corridorSnapMeters) ||
                (i < 2 && distanceM(segment.geometry.at(-1)!, points[i + 1]!) > policy.corridorSnapMeters))
              throw new RoutingFailure('corridor_endpoint_mismatch');
            segments.push(segment);
          }
        } catch (error) {
          if (calculation.signal?.aborted) return fail('provider_unavailable', 'cancelled');
          providerFailed = true;
          continue;
        }
        const gaps: [number, number] = [
          distanceM(segments[0]!.geometry.at(-1)!, segments[1]!.geometry[0]!),
          distanceM(segments[1]!.geometry.at(-1)!, segments[2]!.geometry[0]!),
        ];
        if (gaps.some((gap) => gap > policy.joinToleranceMeters)) continue;
        const meters = segments.reduce((n, s) => n + s.distanceMeters, 0);
        const seconds = segments.reduce((n, s) => n + s.durationSeconds, 0);
        if (meters / baseline.distanceMeters > policy.maxDistanceRatio ||
            seconds / baseline.durationSeconds > Math.min(policy.maxTimeRatio, req.maxTimeRatio ?? Infinity) ||
            seconds - baseline.durationSeconds > Math.min(policy.maxExtraTimeSeconds, req.maxExtraTimeSeconds ?? Infinity)) continue;
        // Measure each intact provider segment; no straight segment inserted at a join.
        const overlaps = segments.map((s) => measureCorridorOverlap(s.geometry, features, overlapOptions));
        if (overlaps.some((o) => o === null)) continue;
        const corridorMeters = overlaps.reduce((n, o) => n + o!.overlapMeters, 0);
        if (corridorMeters < policy.minCorridorMeters || corridorMeters / meters < policy.minCorridorShare ||
            corridorMeters > meters || corridorMeters - baseOverlap.overlapMeters < policy.minOverlapGainMeters) continue;
        // Require the routed entry-to-exit leg itself to follow the eligible network, not merely its approaches.
        if (overlaps[1]!.overlapMeters / lineLengthMeters(segments[1]!.geometry) < 0.8) continue;
        const sources = [...new Set(segments.map((s) => s.source))];
        const types = [...new Set(overlaps.flatMap((o) => o!.infrastructureTypes))].sort() as BegaInfrastructure[];
        valid.push({
          id: `${candidate.entry.nodeId}:${candidate.exit.nodeId}`,
          value: {
            mode: req.mode, segments, geometry: { type: 'MultiLineString', coordinates: segments.map((s) => s.geometry) },
            source: sources.join(' + '), quality: 'estimated', distanceMeters: meters, durationSeconds: seconds,
            corridorMeters, corridorShare: corridorMeters / meters, baselineCorridorMeters: baseOverlap.overlapMeters,
            deltaDistanceMeters: meters - baseline.distanceMeters, deltaTimeSeconds: seconds - baseline.durationSeconds,
            timeRatio: seconds / baseline.durationSeconds, joinGapsMeters: gaps, infrastructureTypes: types,
            entry: candidate.entry, exit: candidate.exit,
            overlap: { type: 'FeatureCollection', features: overlaps.flatMap((o) => o!.parts.map((part) => ({
              type: 'Feature' as const,
              geometry: { type: 'LineString' as const, coordinates: part.coordinates },
              properties: { osmIds: part.featureIds, infrastructureTypes: part.infrastructureTypes as BegaInfrastructure[] },
            }))) },
          },
        });
      }
      // Fastest qualifying practical route, then distance, greater overlap, stable node reference.
      valid.sort((a, b) => a.value.durationSeconds - b.value.durationSeconds ||
        a.value.distanceMeters - b.value.distanceMeters || b.value.corridorMeters - a.value.corridorMeters ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const best = valid[0]?.value;
      if (!best) return fail(providerFailed ? 'provider_unavailable' : 'no_valid_alternative', providerFailed ? 'candidate_provider_failure' : 'no_qualifying_candidate');
      return BegaResponse.parse({
        status: 'available', reason: 'qualifying_mapped_corridor_alternative', baseline, alternative: best,
        calculatedAt, explanation: availableExplanation(best.deltaTimeSeconds, best.corridorMeters),
        integrity: { ...integrity(), routingProvider: [...new Set([baseline.source, ...best.segments.map((s) => s.source)])].join(' + ') },
      });
    } catch (error) {
      return fail('provider_unavailable', error instanceof RoutingFailure ? error.message : 'invalid_or_unavailable_provider');
    } finally { analyses--; }
  }
  return {
    calculateBegaAlternative,
    clearCache() { for (const key of cache.keys()) removeCached(key); },
    policy: Object.freeze({ ...policy }),
  };
}
