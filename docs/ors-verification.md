# ORS / HeiGIT verification — 14 Nov 2026

Status: **live integration passed in the selected Codex cloud environment**. This verifies the
local backend and its secure HTTPS proxy path; it is not a production-deployment check.

## Secret and network

The environment's current status reported `ORS_API_KEY` as `ready`, scoped to `api.heigit.org`,
with an enforced network policy allowing that host. The secret binding and inherited HTTPS
proxy were present. Authenticated requests succeeded through the proxy without exposing the
binding or credential in commands, logs, response reports, repository files or frontend code.
TLS verification and inherited CA trust remained enabled.

All directions and matrix calls now use `https://api.heigit.org/openrouteservice/v2/`.
The four services retain their existing server-side Authorization headers, response validation,
cache/deduplication, error handling and optional-provider fallbacks.

## Actual Timișoara requests

Origin `[21.2087, 45.7503]`, destination `[21.2258, 45.7525]`, in `[longitude, latitude]` order.
Each directions request was an authenticated POST with these coordinates and `instructions: true`.

| Profile | Actual upstream HTTP | Distance (m) | Duration (s) | Geometry points | Steps |
| --- | --- | --- | --- | --- | --- |
| `driving-car` | 200 | 2010.2 | 364.8 | 60 | 9 |
| `foot-walking` | 200 | 1484.8 | 1069.0 | 64 | 15 |
| `cycling-regular` | 200 | 1852.2 | 515.3 | 74 | 24 |

These are provider estimates, without live traffic or a safety/accessibility guarantee.
The initial curl checks used the inherited secure HTTPS proxy, a 5-second connection limit,
15-second total request limit and zero retries. All returned HTTP 200 in 1.07–1.18 seconds.
Credentials were supplied to curl through stdin, not process arguments or files; response
output was limited to status, timing, geometry counts and route metrics.

The actual backend then ran under Node 24.22.1 with `NODE_USE_ENV_PROXY=1` and the inherited
secret/proxy bindings. A temporary harness observed actual upstream responses while exercising
the existing application endpoints and matrix services; it used no mocked responses:

- `GET /api/health`: HTTP 200.
- `POST /api/journeys/compare`: HTTP 200; drive, walk and cycle all available with ORS sources.
  Each upstream directions request returned HTTP 200 (275–515 ms).
- All returned routes passed schema parsing, positive metrics, nonempty maneuver validation,
  valid maneuver indices and endpoint snapping within 250 m. The original provider geometry
  was retained and quality remained `estimated`.
- `POST /api/navigation/routes`: HTTP 200, with the same cached driving route.
- Repeating `/api/journeys/compare` reused the existing cache with no extra upstream requests.
- Driving matrix: actual upstream HTTP 200 (192 ms); backend result 2010 m / 6.1 min, ORS source.
- Walking matrix: actual upstream HTTP 200 (552 ms); backend result 1485 m / 17.8 min, ORS source.
- API bodies were checked against the secret binding and did not contain it.

The backend pass made exactly five upstream requests, with zero retries. Existing upstream
timeouts remained 15 seconds for directions, 8 seconds for driving matrix and 10 seconds for
walking matrix. Local API checks had 20-second limits and the harness had a 60-second overall
deadline. No provider or proxy blocker occurred.

## Regression checks

The existing routing tests assert the new URLs for all three directions profiles and both
matrix profiles while retaining geometry, caching, key isolation and graceful-failure coverage.
The workspace checks use the pinned pnpm 12.18.0 and unchanged dependency lockfile.

All required checks passed:

- `pnpm typecheck`: all three packages passed.
- `pnpm test`: 147 tests passed across 25 files (shared 69, backend 53, frontend 25).
- `pnpm build`: TypeScript, Vite production build and PWA shell preparation passed.
  Vite reported a non-failing warning for the existing large map-engine chunk.
- `git diff --check`: passed. No deprecated ORS API hostname remained in tracked source/docs.
- The changed files and generated frontend build were checked for the secret binding;
  it was absent. No dependency, frontend behavior or fallback logic changed.

For another live check, run the backend with `NODE_USE_ENV_PROXY=1 pnpm -F backend start`
in a correctly configured Node 24 cloud environment, then POST the coordinates above to
`/api/journeys/compare` with a bounded client timeout. Verify every mode and source in the
body: the comparison API can return HTTP 200 even when a mode is unavailable. Do not enable
verbose HTTP/header logging or print environment variable values.

## Mission 01 — fresh integration and hardening evidence

Date: **14 Nov 2026**, Europe/Bucharest. The live run began at **16:07:23 UTC / 18:07:23 Bucharest**.
Environment: selected Codex Linux cloud computer, Node **24.22.1**, pnpm **12.18.0**,
inherited HTTPS proxy/CA trust and a ready `ORS_API_KEY` HTTP binding scoped to `api.heigit.org`.
This section is fresh evidence; the original verification above remains historical.

### Repository and reviewed revision

- Fetched all remote heads before integration. Working tree was clean.
- Latest inspected `origin/main`: `f8ae4747ed36fcbfdce98d7228aeedfac66eaeb6`.
- Original migration: `3d740750b76c6cfd0ac04d1ea8e200c8089aeef0`.
- Original feature: `origin/feature/ors-heigit-integration` at
  `1ddc438762c5f139a1c33d798e3b07952326cfab`, two commits ahead / zero behind main;
  merge base was main itself. No duplicate cherry-pick was needed.
- Created **`feature/unihack-final-integration`** from fetched main and fast-forwarded the verified
  feature history into it. The target branch did not exist remotely. No new merge conflicts occurred.
- Reviewed hardening/code revision: **`ef4419edf9efe4da5116e12c14332091555ea34a`**.
  The subsequent evidence commit changes only this record.
- No mainline merge, branch deletion, history rewrite, reset or force-push is part of this delivery.

### Architecture and concrete risks resolved

The existing flow is reused:

`GreenSwitch/useCompleteJourneys or useNavigation → validated HTTP API → journey/navigation Express
router → completeJourneys / getRoutes / activeDirections → existing ORS or OSRM/FOSSGIS service →
shared Zod contracts → journeyLayers / NavigationMap`.

`recommendParkings` still calls the walking/driving matrices in parallel, then the unchanged
SmartMatch engine ranks candidates. `completeJourneys` still limits full directions to three parking
candidates with two candidates in flight and isolates direct active modes with `Promise.allSettled`.

| Boundary | Existing responsibility | Mission 01 change |
| --- | --- | --- |
| `routing.ts` | Driving ORS/OSRM normalization, steps, cache/coalescing | Validate requested endpoints before successful caching; retain safe HTTP status diagnostics |
| `journeys.ts` | Distinct foot/bike profiles and comparison cache | Validate direct ORS and FOSSGIS endpoints too; retain safe failure diagnostics |
| `activeRouting.ts` | Per-mode directions cache, endpoint validation | Reuse extracted `routeValidation.ts`; keep the existing exported helper compatible |
| `walking.ts`, `driving.ts` | Batched matrices, validation, cache/backoff and honest fallback metrics | Preserve behavior; replace raw exception logging/silent failure with fixed diagnostic categories |
| `routingDiagnostics.ts` | New small diagnostic helper | Only provider/profile/operation/category/status; never headers, body, URL coordinates or arbitrary exception text |
| Frontend/shared contracts/SmartMatch | Presentation, request cancellation, schemas and ranking | No source changes |

The endpoint guard previously protected complete journeys but not every direct navigation/comparison
path. A valid-looking line from another location could enter a direct route cache. All directions
entry points now reject endpoints outside the existing 250 m snapping tolerance. Shared route schemas
still enforce finite WGS84 coordinates, positive finite metrics, nonempty lines and bounded maneuver
indices. No provider geometry is replaced or interpolated by this change.

Diagnostics now distinguish authentication (401/403), rate limiting (429), not found (404), other HTTP
errors, timeout, malformed/schema-invalid payload and network/provider failures. Public API error and
unavailable shapes are unchanged. A configured ORS failure does not silently switch to a keyless router.
Missing configuration still selects the existing OSRM/FOSSGIS fallback; matrix failure still yields
unknown driving or a labelled walking screening estimate. No straight-line complete route is created.

### Cache and reliability inventory

| Cache | Key / isolation | Existing success / failure policy retained |
| --- | --- | --- |
| Driving directions | Origin/destination rounded to 5 decimals | 100 entries, 5 min; in-flight coalescing; failure releases pending job |
| Active directions | Exact mode + origin/destination | 100 entries, 5 min; mode isolation and coalescing |
| Direct comparison | Rounded endpoints; returns all modes | 100 entries, 5 min success / 15 s partial backoff |
| Driving matrix | Exact origin and ordered destinations | 100 entries, 5 min success / 15 s failure; coalescing |
| Walking matrix | Destination and ordered points rounded to 5 decimals | 200 entries, 30 min success / 15 s failure; coalescing |
| Complete journeys | Exact endpoints, constraints and arrival/time bucket; all rankings returned | 100 entries, 60 s success / 15 s partial; coalescing; 12 pending comparisons |

Provider deadlines remain **15 s directions, 8 s driving matrix, 10 s walking matrix**. No retry loop
or second cache/provider engine was introduced. FOSSGIS keeps its existing 1100 ms spacing, bounded
12-request queue, team User-Agent and attribution policy. Malformed/misrouted full directions cannot
populate a successful cache. Tests cover expiration, released failed jobs and short matrix backoff.

### Fresh real-backend smoke

Command (opt-in, requires configured credentials and free port 18787):

```bash
NODE_USE_ENV_PROXY=1 pnpm -F backend exec tsx ../scripts/verify-ors.ts
```

The script starts the actual Express backend, observes its actual Node fetch responses and validates
the API bodies with the shared contracts. There are no mocked provider/API responses. It permits at
most ten provider requests, uses a 5 s connection/response-header cutoff plus the existing total
provider deadlines, a 45 s local API deadline and 60 s overall deadline, with zero retries. It preserves
TLS verification, inherited proxy variables and CA trust. Node proxy opt-in is for this environment,
not a universal production setting. Error output is limited to safe locally authored codes.

Coordinates were origin `[21.2087, 45.7503]` and destination `[21.2258, 45.7525]`, with explicit
arrival `2026-11-16T08:00:00Z` and maximum final walk 20 min. No historical route measurements were
hardcoded into assertions.

| Actual upstream capability | Requests | HTTP | Fresh result |
| --- | --- | --- | --- |
| `directions/driving-car/geojson` | 3 | 200 each | Parking routes 1274.0–1340.8 m, 234.7–243.3 s; 34 points each |
| `directions/foot-walking/geojson` | 4 | 200 each | Direct walk 1484.8 m / 1069.0 s / 64 points; parking walks 196.4–266.1 m / 141.4–191.6 s / 15–17 points |
| `directions/cycling-regular/geojson` | 1 | 200 | 1852.2 m / 515.3 s / 74 points |
| `matrix/driving-car` | 1 | 200 | 30 cells validated; sample positive cell 2028.29 m / 363.56 s |
| `matrix/foot-walking` | 1 | 200 | 30 cells validated; sample positive cell 35.37 m / 25.47 s |

`GET /api/health`, `POST /api/journeys/complete` twice and `POST /api/navigation/routes` all returned
**HTTP 200**. The complete response had no unavailable categories, included three real car alternatives
and direct walk/cycle, and retained `estimated` quality and ORS provenance. The first ranked complete
car journey totalled **1491.8 m / 378.1 s** of driving plus final walking; parking search remains unknown
and excluded. Geometry, steps, maneuver indices, requested endpoints and leg continuity were validated.

Exactly **10 upstream requests** completed, with observed response-header times **156–1277 ms**.
The entire smoke completed in **2696 ms**. Repeating the complete request and requesting its selected
driving navigation leg produced **zero additional upstream calls**. This is one smoke observation,
not a throughput benchmark or service guarantee. API bodies did not contain the secret binding.

### Deterministic and browser QA

Final required checks all passed:

```bash
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

**189 tests / 29 files** passed: shared **69 / 10**, backend **90 / 12**, frontend **30 / 7**.
The 18 new routing-integrity tests cover wrong endpoints, coordinate bounds, empty/unsupported geometry,
nonfinite/negative metrics, invalid maneuvers, separate profile caching/coalescing/expiry, authentication
and rate-limit failures, all upstream timeouts, released pending work, matrix fallback/backoff and safe
logging of malformed JSON/network failures. Existing SmartMatch, complete journey, preference, scenario,
OSRM/FOSSGIS and shared-schema tests remain enabled. No dependency or lockfile change was made.

Browser tooling: existing Playwright at `/opt/codex/cua_node/lib/node_modules/playwright` and installed
`/usr/bin/chromium`, headless. Set `PLAYWRIGHT_MODULE` to that location for these commands. Browser
servers deliberately used an empty ORS binding **only in their child processes** to avoid quota use;
the live smoke above used the configured secret. The dev UI ran at 5173 against backend 8787, and the
compiled same-origin app at 8887 (`NODE_ENV=production API_PORT=8887 pnpm -F backend start`).

| Executed browser command | Bound | Final result / scope |
| --- | --- | --- |
| `node scripts/test-smart-journey-browser.cjs` | 150 s | PASS: parking-first search/preview, shared settings, loading, route/leg emphasis, stale responses, Motion handoff, zero selection rewards |
| `node scripts/test-navigation-browser.cjs` | 300 s | PASS: alternatives, permission denial, DEMO pause/restart/arrival, 2D/3D camera, GPS origin/speed/accuracy, reroute/cooldown and cleanup |
| `node scripts/test-routing-reliability-browser.cjs` | 90 s | PASS: synthetic 503/recovery, no fabricated vehicle, parking-full keep/15 s expiry/accepted switch from simulated position; exactly one accepted-switch request |
| `node scripts/test-premium-browser.cjs` | 150 s | PASS: theme persistence, responsive layouts, municipal search, explicit origin, Motion/wallet session continuity, City/Data, reduced motion and unknown-route recovery |
| `node scripts/test-production-browser.cjs` | 120 s | PASS: compiled app, deep-link refresh, synthetic complete-plan handoff, offline Motion DEMO; 34 public cache entries and zero API cache entries |
| `node scripts/test-pwa-browser.cjs` | 60 s | PASS: public shell/assets only, no API/Authorization cache, cookie-free static fetch, offline deep link and update preserving active session |

Browser route fixtures remain explicitly synthetic; they prove interface behavior, not road connectivity,
provider availability or real GPS. The Smart Journey screenshots at **360, 390, 430, 768 and 1440 px**
were visually inspected. No horizontal overflow was reported; selected route layers, scrollable sheet,
primary action and map controls remained usable. Theme changes retained the map instance/layers;
Romanian fonts and reduced motion checks passed. Browser exception collectors were empty.

Failures observed and resolved during this mission:

- One new endpoint test initially used a two-point invalid fixture with an out-of-bounds maneuver;
  it correctly failed at the earlier maneuver check. The fixture was corrected to isolate the endpoint
  risk, without weakening the assertion.
- Smart Journey's old exact wrapped-label selector did not match the select's accessible label,
  which includes its option text. It now uses the intended combobox role and label prefix; every
  existing behavior assertion remains intact.
- Navigation's first 120 s process limit expired during `page.clock.runFor(22000)`. The unchanged
  navigation script completed successfully with a bounded 300 s allowance. No application timing
  or simulation behavior was changed to make it pass.

The Vite build retained its non-failing warning for the existing 801.65 kB map-engine chunk. The
frontend asset hashes were unchanged by backend hardening; no visual redesign or UI source edit occurred.

### Security, limitations and release checks

A silent scan of **261 tracked/new/generated files**, including frontend build assets, found no
configured secret binding. Reviewed source/diagnostics do not log Authorization, provider response
bodies, arbitrary exceptions or route coordinates. No `.env`/credential file is tracked. HTTP keys
remain backend-only; no `VITE_` secret or TLS bypass was added. Deprecated ORS API host and merge-marker
scans passed. SmartMatch scoring, complete orchestration, shared contracts, frontend source and
dependency inputs were verified unchanged against the original integration head.

The managed policy permits HeiGIT but not the external basemap or keyless fallback hosts. Browser
screenshots therefore exercise the existing local Timpark fallback. Live external vector tiles and
live keyless OSRM/FOSSGIS connectivity are **not verified**; their deterministic fallback tests passed.
No public `vlaiqflow.ro` deployment, real-phone GPS/installation or accessibility certification was
performed. The compiled local production-mode test is not evidence of a public deployment.

Release procedure: fetch all heads again, compare fetched main/feature histories, push only
`feature/unihack-final-integration` with an ordinary non-forced push, then read the remote ref and
fetch it back to verify the migration, mainline base and reviewed hardening revision are reachable.
Do not automatically merge into main. Mission 02 remains outside this branch's scope.
