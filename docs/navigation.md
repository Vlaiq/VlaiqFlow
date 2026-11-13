# Navigation mode

The existing Explore screen is preserved. Open **Navigație 3D** to enter `/navigation`.
The feature uses the existing React, TypeScript, MapLibre, Lucide and Express dependencies.

## Run

Use Node 20.11+ and the pinned pnpm 12.18.0 (`package.json`). In the prepared cloud instance:

```bash
export PATH="/workspace/.tools/node_modules/.bin:$PATH"
cd /workspace/VlaiqFlow
pnpm install --frozen-lockfile --store-dir /workspace/.cache/pnpm
NODE_USE_ENV_PROXY=1 pnpm dev
```

`NODE_USE_ENV_PROXY=1` enables Node 24's fetch proxy support in the managed cloud.
Outside a managed proxy environment, use `pnpm dev`. Local ignored `.env` files are copied
from the examples during onboarding; preserve any existing values.

The frontend runs on port 5173 and proxies `/api` to backend port 8787.
For a phone, serve through HTTPS; browser GPS works only in a secure context.

## Interaction

- **Route Preview:** north-up overview, real provider alternatives when available,
  destination presets, and optional origin selection by tapping the map.
- **Start navigație:** requests location on user action, obtains a fresh fix, calculates
  a new route from that actual location, and starts foreground `watchPosition`.
  Manual origin selection applies to preview/DEMO; it never substitutes for live GPS.
- **Navigation:** 52–56° perspective, heading-follow camera, upcoming/traveled route,
  provider maneuvers, remaining distance and estimated time. Dragging suspends following;
  Recenter resumes it. North-up and 2D/3D are available. Reduced motion uses instant
  camera transitions. Building extrusion uses tile heights only where provided.
- **DEMO:** independent session animation along the returned route, labeled simulated
  position and speed, with pause, resume, restart and arrival. It needs a successful
  route response, but never asks for GPS. No hardcoded road geometry is shipped.
- **Exit:** cancels route requests, speech, animation frames, GPS watchers and wake locks.

## Providers and data

Routing is `POST /api/navigation/routes` with GeoJSON `[longitude, latitude]` origin and
destination. Requests are validated and restricted to the Timișoara prototype area
(longitude 21–21.5, latitude 45.6–45.9). The server deduplicates concurrent requests,
caches results for five minutes, and bounds upstream timeouts and cache size.

When backend `ORS_API_KEY` is configured, openrouteservice supplies routes and steps.
Otherwise, OSRM's public demo provides a low-volume prototype fallback. No key is
included in frontend variables or responses. Production needs a provisioned routing
service; the OSRM public service offers no availability guarantee.

Network destinations:

- `tiles.openfreemap.org` — real vector map, labels, glyphs and buildings.
- `router.project-osrm.org` — prototype routing fallback.
- `api.openrouteservice.org` — preferred routing provider when a key is configured.

Provider distance and duration are **estimated**, without live traffic. Remaining time
uses the fraction of route geometry remaining, rather than a traffic prediction.
GPS speed is shown only when supplied or conservatively derived from sufficiently
separated, accurate fixes; derived speed is labeled estimated. Unknown heading shows
a dot, rather than an invented direction. Poor fixes preserve the last valid location
and clear speed. The accuracy area appears where relevant; no speed limits or traffic
incidents are invented. Rerouting requires three off-route fixes and a 30-second cooldown;
failed rerouting keeps the previous route. Navigation runs in the foreground only.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
```

For the browser integration script, provide an existing Playwright installation and Chromium:

```bash
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright \
NAV_TEST_OUTPUT=/workspace/artifacts/navigation \
node scripts/test-navigation-browser.cjs
```

On another machine, install Playwright in your test tooling and set `PLAYWRIGHT_MODULE`
and `CHROMIUM_PATH` accordingly. The script exercises actual MapLibre camera controls,
GPS permission/error handling, demo playback/arrival, route alternatives, rerouting,
cooldown and watcher cleanup. It deliberately intercepts routing and map style with
**synthetic test fixtures**; resulting screenshots are stamped accordingly.
It does not establish real road connectivity or successful provider access.

During implementation, real OpenFreeMap and OSRM requests returned HTTP 403 from the
cloud network policy; the backend correctly returned 503 without inventing a route.
Domain additions were saved in the environment draft and still need applying in settings.
After applying them, verify a nonempty real route response, vector tile loading and
the complete DEMO in Timișoara, then test GPS on an HTTPS phone session.
