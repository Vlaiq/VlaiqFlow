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
