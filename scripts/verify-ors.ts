// Opt-in live smoke: NODE_USE_ENV_PROXY=1 pnpm -F backend exec tsx ../scripts/verify-ors.ts
// Uses the real backend, inherited credentials/proxy/CA trust, and at most ten provider requests.
import assert from 'node:assert/strict';
import { CompleteJourneyRequest, CompleteJourneyResponse, HealthResponse, RoutesResponse } from '../shared/src/index';
import { validateEndpoints } from '../backend/src/services/routeValidation';

class SmokeFailure extends Error {}
function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new SmokeFailure(code);
}
async function main() {
  const secret = process.env.ORS_API_KEY?.trim();
  check(secret, 'ORS_BINDING_MISSING');
  if (process.env.HTTPS_PROXY || process.env.https_proxy)
    check(process.env.NODE_USE_ENV_PROXY === '1', 'ENABLE_NODE_ENV_PROXY_FOR_THIS_CLOUD_RUN');
  process.env.API_PORT ??= '18787';
  const base = `http://127.0.0.1:${process.env.API_PORT}`;
  const origin: [number, number] = [21.2087, 45.7503];
  const destination: [number, number] = [21.2258, 45.7525];
  const started = performance.now();
  const watchdog = setTimeout(() => {
    console.log(JSON.stringify({ result: 'FAIL', code: 'OVERALL_TIMEOUT_60S' }));
    process.exit(1);
  }, 60000);
  let attempts = 0;
  const observations: { path: string; status: number; elapsed_ms: number; points?: number; distance_m?: number; duration_s?: number; cells?: number }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === base) return realFetch(input, init);
    check(url.origin === 'https://api.heigit.org' && url.pathname.startsWith('/openrouteservice/v2/'), 'UNEXPECTED_PROVIDER');
    check(++attempts <= 10, 'PROVIDER_REQUEST_BUDGET_EXCEEDED');
    const headersDeadline = new AbortController();
    // This 5s connection/headers deadline is stricter than the service's total deadline.
    const timer = setTimeout(() => headersDeadline.abort(), 5000);
    const signal = AbortSignal.any([headersDeadline.signal, AbortSignal.timeout(15000), ...(init?.signal ? [init.signal] : [])]);
    const at = performance.now();
    let response: Response;
    try { response = await realFetch(input, { ...init, signal }); }
    finally { clearTimeout(timer); }
    const observation: typeof observations[number] = { path: url.pathname, status: response.status, elapsed_ms: Math.round(performance.now() - at) };
    observations.push(observation);
    if (response.ok) {
      const body = await response.clone().json();
      if (body.features) {
        const feature = body.features[0];
        observation.points = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates.length : undefined;
        const summary = feature?.properties?.summary;
        if (typeof summary?.distance === 'number' && Number.isFinite(summary.distance)) observation.distance_m = summary.distance;
        if (typeof summary?.duration === 'number' && Number.isFinite(summary.duration)) observation.duration_s = summary.duration;
      } else {
        const durations: unknown[] = body.durations?.flat() ?? [];
        const distances: unknown[] = body.distances?.flat() ?? [];
        check(durations.length > 0 && durations.every((v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)), 'INVALID_MATRIX_DURATIONS');
        check(distances.length === durations.length && distances.every((v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)), 'INVALID_MATRIX_DISTANCES');
        check(durations.some((v) => typeof v === 'number' && v > 0), 'MATRIX_HAS_NO_ROUTABLE_CELLS');
        observation.cells = durations.length;
        observation.duration_s = durations.find((v): v is number => typeof v === 'number' && v > 0);
        observation.distance_m = distances.find((v): v is number => typeof v === 'number' && v > 0);
      }
    }
    console.log(JSON.stringify({ upstream: observation }));
    return response;
  };
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(45000),
    });
    const text = await response.text();
    check(!text.includes(secret), 'SECRET_BINDING_IN_API_RESPONSE');
    console.log(JSON.stringify({ api: path, status: response.status }));
    check(response.status === 200, 'APPLICATION_HTTP_FAILURE');
    return JSON.parse(text);
  };
  console.log(JSON.stringify({ date: new Date().toISOString(), node: process.version, origin, destination, provider_request_budget: 10, connection_headers_timeout_ms: 5000, overall_timeout_ms: 60000, retries: 0 }));
  await import('../backend/src/index');
  const health = HealthResponse.parse(await request('/api/health'));
  check(health.integrations.routing === 'configured', 'ROUTING_NOT_CONFIGURED');
  const input = CompleteJourneyRequest.parse({ origin, destination, arriveAt: '2026-11-16T08:00:00.000Z', maxWalkMinutes: 20 });
  const first = CompleteJourneyResponse.parse(await request('/api/journeys/complete', input));
  check(first.unavailable.length === 0, 'UNAVAILABLE_JOURNEY_CATEGORY');
  for (const category of ['car_park_walk', 'walk', 'cycle'] as const) {
    const journey = first.journeys.find((j) => j.category === category);
    check(journey, 'MISSING_JOURNEY_CATEGORY');
    for (const leg of journey.legs) {
      if (leg.type === 'parking') continue;
      check(leg.route.source.startsWith('openrouteservice'), 'WRONG_ROUTE_PROVIDER');
      validateEndpoints(leg.route.geometry, leg.from, leg.to);
      check(leg.route.geometry.length > 2 && leg.route.steps.length > 0, 'MISSING_REAL_GEOMETRY');
    }
    console.log(JSON.stringify({ category, result: 'PASS', distance_m: journey.distance.value, duration_s: journey.travelSeconds.value, profiles: journey.legs.filter((l) => l.type !== 'parking').map((l) => l.profile), geometry: 'validated', quality: journey.travelSeconds.quality }));
  }
  const before = attempts;
  const repeated = await request('/api/journeys/complete', input);
  assert.deepEqual(repeated, first);
  const car = first.journeys.find((j) => j.category === 'car_park_walk')!;
  const drive = car.legs.find((l) => l.type === 'drive')!;
  const navigation = RoutesResponse.parse(await request('/api/navigation/routes', { origin: drive.from, destination: drive.to }));
  assert.deepEqual(navigation.routes[0], drive.route);
  check(attempts === before, 'CACHE_REUSE_FAILED');
  check(observations.length <= 10 && observations.every((o) => o.status === 200), 'UPSTREAM_HTTP_FAILURE');
  for (const path of ['matrix/driving-car', 'matrix/foot-walking', 'directions/driving-car/geojson', 'directions/foot-walking/geojson', 'directions/cycling-regular/geojson'])
    check(observations.some((o) => o.path.endsWith(path)), 'UNTESTED_PROVIDER_CAPABILITY');
  clearTimeout(watchdog);
  console.log(JSON.stringify({ result: 'PASS', upstream_requests: attempts, cache_reuse: 'PASS', secret_response_scan: 'PASS', elapsed_ms: Math.round(performance.now() - started), retries: 0 }));
  process.exit(0);
}
main().catch((error: unknown) => {
  // Only locally authored failure codes can be printed. Assertion/network payloads remain private.
  console.log(JSON.stringify({ result: 'FAIL', code: error instanceof SmokeFailure ? error.message : 'CLIENT_OR_VALIDATION_FAILURE', type: error instanceof Error ? error.name : 'Error' }));
  process.exit(1);
});
