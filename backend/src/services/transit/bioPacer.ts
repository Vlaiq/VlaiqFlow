import { distanceM } from '../../../../shared/src/geo';
import type { Coordinate } from '../../../../shared/src/schemas/navigation';
import {
  BioPacerRequest, BioPacerResult, ScheduledDeparture, WalkingAccess,
  type BioPacerOption, type TransitUnavailableReason,
} from '../../../../shared/src/schemas/transit';
import { departuresForStop } from './departures';
import type { TransitIndex } from './gtfsIndex';

/** Adapter must reuse the existing backend foot-routing provider, cache and policy controls. */
export interface WalkingDependency {
  (from: Coordinate, to: Coordinate, signal: AbortSignal): Promise<WalkingAccess | null>;
}
const limitations = [
  'Plecare programată, fără informații live despre întârzieri, anulări sau prezența vehiculului.',
  'Durata mersului și fezabilitatea sunt estimări; îmbarcarea nu este garantată.',
  'Accesibilitatea, trecerile și intrarea pe peron nu sunt verificate; păstrează timp suplimentar.',
  'Geometria pietonală poate avea ajustări de până la 50 m la capete; accesul exact nu este certificat.',
  'Asistent de acces la stație; direcția către destinația finală nu este validată.',
];
/** Deterministic calculation, separately usable for a selected published departure. */
export function assessDeparture(request: BioPacerRequest, departure: ScheduledDeparture, walking: WalkingAccess | null): BioPacerOption {
  const req = BioPacerRequest.parse(request), dep = ScheduledDeparture.parse(departure);
  const walk = walking === null ? null : WalkingAccess.parse(walking);
  const remainingSeconds = (Date.parse(dep.scheduledAt) - Date.parse(req.startAt)) / 1000;
  const availableSeconds = remainingSeconds - req.connectionBufferSeconds;
  const requiredSpeedKmh = availableSeconds > 0 && walk ? 3.6 * walk.distanceMeters / availableSeconds : null;
  // A slower personal preference extends the provider estimate; a faster one never shortens it.
  const estimatedWalkSeconds = walk ? Math.max(walk.durationSeconds, 3.6 * walk.distanceMeters / req.comfortableSpeedKmh) : null;
  let category: BioPacerOption['category'] = 'UNKNOWN';
  if (remainingSeconds <= 0) category = 'MISSED';
  else if (availableSeconds <= 0) category = 'TOO_TIGHT';
  else if (walk && estimatedWalkSeconds !== null && requiredSpeedKmh !== null) {
    if (availableSeconds >= estimatedWalkSeconds && requiredSpeedKmh <= req.comfortableSpeedKmh) category = 'COMFORTABLE';
    else if (availableSeconds >= estimatedWalkSeconds / req.briskMultiplier && requiredSpeedKmh <= req.comfortableSpeedKmh * req.briskMultiplier) category = 'BRISK';
    else category = 'TOO_TIGHT';
  }
  const explanations = {
    COMFORTABLE: 'Timp estimat suficient pentru ritmul ales și marja de conexiune. Verifică plecarea programată.',
    BRISK: 'Conexiune strânsă față de ritmul ales; o plecare ulterioară poate fi mai potrivită.',
    TOO_TIGHT: 'Timp insuficient pentru mersul estimat și marjă. Alege o plecare ulterioară.',
    MISSED: 'Ora programată a trecut față de începutul mersului ales.',
    UNKNOWN: 'Traseul pietonal este indisponibil; nu putem evalua conexiunea.',
  };
  return { departure: dep, walking: walk, availableSeconds, remainingSeconds, requiredSpeedKmh, estimatedWalkSeconds, category, explanation: explanations[category] };
}

async function routeWithDeadline(walk: WalkingDependency, from: Coordinate, to: Coordinate, timeoutMs: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => walk(from, to, controller.signal)),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('WALKING_TIMEOUT')); }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
export async function calculateBioPacer(input: unknown, index: TransitIndex | null, walking: WalkingDependency, settings: {
  now?: () => Date; walkingTimeoutMs?: number;
} = {}): Promise<BioPacerResult> {
  const calculatedAt = (settings.now?.() ?? new Date()).toISOString();
  const feed = index?.digest.metadata ?? null;
  const base: BioPacerResult = {
    status: 'unavailable', reason: 'GTFS_UNAVAILABLE', options: [], recommendedDepartureId: null, recommendation: 'NONE',
    stops: [], requestedStartAt: null, evaluatedStartAt: null,
    feed, calculatedAt, failures: [], limitations: [...limitations],
    quality: { schedule: feed?.quality ?? 'unknown', walking: 'unknown', feasibility: 'unknown', liveService: 'unknown' },
  };
  const finish = () => BioPacerResult.parse(base);
  const parsed = BioPacerRequest.safeParse(input);
  if (!parsed.success) { base.reason = 'INVALID_INPUT'; return finish(); }
  base.requestedStartAt = parsed.data.startAt;
  if (!index) return finish();
  let req = parsed.data;
  // Tolerate request transit time, but never evaluate using elapsed walking time in the past.
  if (Date.parse(req.startAt) < Date.parse(calculatedAt) - 60000) { base.reason = 'INVALID_INPUT'; return finish(); }
  req = { ...req, startAt: new Date(Math.max(Date.parse(req.startAt), Date.parse(calculatedAt))).toISOString() };
  base.evaluatedStartAt = req.startAt;
  const timeout = settings.walkingTimeoutMs ?? 15000;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 30000) { base.reason = 'INVALID_INPUT'; return finish(); }
  const explicitStop = req.stopId ? index.stops.get(req.stopId) : null;
  const candidates = req.stopId ? (explicitStop?.locationType === 0 && explicitStop.coordinate && distanceM(req.origin, explicitStop.coordinate) <= req.radiusMeters ? [{ stop: explicitStop }] : [])
    : index.nearby(req.origin, req.radiusMeters, req.candidateLimit);
  if (!candidates.length) { base.reason = 'NO_NEARBY_STOP'; return finish(); }
  base.stops = candidates.map((c) => c.stop);
  const results = await Promise.all(candidates.map(async ({ stop }) => {
    const query = departuresForStop(index, { stopId: stop.id, from: req.startAt, horizonSeconds: req.horizonSeconds,
      limit: req.departureLimit, routeId: req.routeId, directionId: req.directionId });
    if (!query.departures.length) return { options: [], reason: query.reason, stopId: stop.id };
    let route: WalkingAccess | null = null, reason: TransitUnavailableReason | null = null;
    try {
      const raw = await routeWithDeadline(walking, req.origin, stop.coordinate!, timeout);
      if (!raw) reason = 'WALKING_UNAVAILABLE';
      else {
        const checked = WalkingAccess.safeParse(raw);
        if (!checked.success) reason = 'INVALID_WALKING_ROUTE';
        else {
          const r = checked.data;
          let geometryMeters = 0;
          for (let i = 1; i < r.geometry.length; i++) geometryMeters += distanceM(r.geometry[i - 1]!, r.geometry[i]!);
          // Retain a stricter 50 m endpoint tolerance for access to an individual platform.
          if (distanceM(r.from, req.origin) > 1 || distanceM(r.to, stop.coordinate!) > 1 ||
              distanceM(r.geometry[0]!, req.origin) > 50 || distanceM(r.geometry.at(-1)!, stop.coordinate!) > 50 ||
              r.distanceMeters + 1 < distanceM(req.origin, stop.coordinate!) ||
              r.distanceMeters + 5 < geometryMeters * 0.95 ||
              (r.distanceMeters > 0 && r.durationSeconds === 0)) reason = 'INVALID_WALKING_ROUTE';
          else route = r;
        }
      }
    } catch (error) { reason = error instanceof Error && error.message === 'WALKING_TIMEOUT' ? 'WALKING_TIMEOUT' : 'WALKING_UNAVAILABLE'; }
    return { options: query.departures.map((dep) => assessDeparture(req, dep, route)), reason, stopId: stop.id };
  }));
  const completedAt = (settings.now?.() ?? new Date()).toISOString();
  base.calculatedAt = completedAt;
  req = { ...req, startAt: new Date(Math.max(Date.parse(req.startAt), Date.parse(completedAt))).toISOString() };
  base.evaluatedStartAt = req.startAt;
  base.options = results.flatMap((r) => r.options)
    .filter((o) => Date.parse(o.departure.scheduledAt) > Date.parse(req.startAt))
    .map((o) => assessDeparture(req, o.departure, o.walking)).sort((a, b) =>
    Date.parse(a.departure.scheduledAt) - Date.parse(b.departure.scheduledAt) ||
    a.departure.stopId.localeCompare(b.departure.stopId, 'en') || a.departure.id.localeCompare(b.departure.id, 'en'));
  base.failures = results.filter((r) => r.reason).map((r) => ({ stopId: r.stopId, reason: r.reason! }));
  const practical = base.options.filter((o) => o.category === 'COMFORTABLE').sort((a, b) =>
    Date.parse(a.departure.scheduledAt) - Date.parse(b.departure.scheduledAt) ||
    a.estimatedWalkSeconds! - b.estimatedWalkSeconds! || a.departure.id.localeCompare(b.departure.id, 'en'))[0];
  if (practical) {
    base.recommendedDepartureId = practical.departure.id;
    base.recommendation = practical === base.options[0] ? 'COMFORTABLE' : 'NEXT_DEPARTURE_RECOMMENDED';
  }
  const hasWalk = base.options.some((o) => o.walking);
  base.status = hasWalk ? 'ok' : 'unavailable';
  base.reason = hasWalk ? null : base.failures[0]?.reason ?? 'NO_DEPARTURE';
  base.quality.walking = hasWalk ? (base.options.some((o) => o.walking?.quality === 'simulated') ? 'simulated' : 'estimated') : 'unknown';
  base.quality.feasibility = hasWalk ? (feed?.quality === 'simulated' || base.quality.walking === 'simulated' ? 'simulated' : 'estimated') : 'unknown';
  return finish();
}
