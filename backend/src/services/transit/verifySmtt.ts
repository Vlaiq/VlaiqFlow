// Explicit operator validation/benchmark command. Unit tests never make provider requests.
import { cpus, platform, arch } from 'node:os';
import { performance } from 'node:perf_hooks';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTransitIndex } from './transitData';
import { departuresForStop } from './departures';
import { BioPacerRequest, type WalkingAccess } from '../../../../shared/src/schemas/transit';
import { assessDeparture, calculateBioPacer } from './bioPacer';

const path = fileURLToPath(new URL('../../../../shared/src/data/smtt-gtfs-digest.json', import.meta.url));
const memoryBefore = process.memoryUsage(), started = performance.now();
const loaded = loadTransitIndex(path), loadMilliseconds = performance.now() - started;
if (!loaded.index) throw new Error(loaded.reason);
const index = loaded.index, memoryAfterLoad = process.memoryUsage();
const query = { stopId: '85', from: '2026-11-16T08:00:00+02:00', limit: 20 };
const examples = ['85', '91', '73'].map((stopId) => ({ stop: index.stops.get(stopId),
  ...departuresForStop(index, { ...query, stopId, limit: 6 }) }));
const samples: number[] = [];
for (let i = 0; i < 10; i++) departuresForStop(index, query);
for (let i = 0; i < 100; i++) {
  const start = performance.now(); departuresForStop(index, query); samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
const metadata = index.digest.metadata;
const report: Record<string, unknown> = {
  verifiedAt: new Date().toISOString(), metadata, snapshotBytes: statSync(path).size,
  calendarRules: index.digest.calendars.length, calendarExceptions: index.digest.exceptions.length,
  afterMidnightRows: index.digest.stopTimes.filter((r) => r[4] !== null && r[4] >= 86400).length,
  approximateTimeRows: index.digest.stopTimes.filter((r) => r[8] === 0).length,
  examples,
  benchmark: { environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
    dataset: metadata.validation.counts, loadMilliseconds,
    query: { ...query, warmupQueries: 10, measuredQueries: 100, minMilliseconds: samples[0],
      medianMilliseconds: samples[50], p95Milliseconds: samples[94], maxMilliseconds: samples[99] },
    memoryBeforeBytes: memoryBefore, memoryAfterLoadBytes: memoryAfterLoad,
    peakRssBytes: process.resourceUsage().maxRSS * 1024,
    note: 'One process, local file load including parse/validation/index. Memory is sampled without forced GC; RSS/heap values are not a scalability guarantee.' },
};
if (process.argv.includes('--walking')) {
  const { existingWalkingAccess } = await import('./walkingAccess');
  const origin = index.stops.get('91')!.coordinate!;
  let providerCalls = 0, providerError: string | null = null;
  const req = BioPacerRequest.parse({ origin, stopId: '85', startAt: query.from, departureLimit: 20 });
  const result = await calculateBioPacer(req, index, async (from, to, signal) => {
    providerCalls++;
    try { return await existingWalkingAccess(from, to, signal); }
    catch (error) { providerError = error instanceof Error ? error.message : 'WALKING_UNAVAILABLE'; throw error; }
  });
  const walk = result.options.find((o) => o.walking)?.walking as WalkingAccess | undefined;
  report.walking = { originPublicGtfsStopId: '91', boardingStopId: '85', plannedStartAt: req.startAt,
    providerCalls, providerError, status: result.status, reason: result.reason, failures: result.failures,
    recommendation: result.recommendation, recommendedDepartureId: result.recommendedDepartureId,
    routedDistanceMeters: walk?.distanceMeters ?? null, estimatedDurationSeconds: walk?.durationSeconds ?? null,
    geometryPoints: walk?.geometry.length ?? null, providerSource: walk?.source ?? null,
    options: result.options.map((o) => ({ departure: o.departure, category: o.category, requiredSpeedKmh: o.requiredSpeedKmh })) };
  if (walk) {
    const departure = result.options[0]!.departure, duration = Math.max(walk.durationSeconds, 3.6 * walk.distanceMeters / req.comfortableSpeedKmh);
    report.walkingScenarios = [
      ['COMFORTABLE', duration * 1.25], ['BRISK', duration * 0.92], ['TOO_TIGHT', duration * 0.5], ['MISSED', -121], ['UNKNOWN', duration * 1.25],
    ].map(([label, available]) => {
      const startAt = new Date(Date.parse(departure.scheduledAt) - (Number(available) + req.connectionBufferSeconds) * 1000).toISOString();
      const o = assessDeparture({ ...req, startAt }, departure, label === 'UNKNOWN' ? null : walk);
      return { planningScenario: label, startAt, category: o.category, requiredSpeedKmh: o.requiredSpeedKmh, availableSeconds: o.availableSeconds };
    });
  }
}
console.log(JSON.stringify(report, null, 2));
