# VLAIQ FLOW

**Park smarter. Move greener.** A Romanian-first mobility PWA for Timișoara, created by team **VLAIQ** for UniHack 2026, Green Mobility.

FLOW connects destination search, parking comparisons, available greener routes and active movement rewards. It extends municipal services: parking payment stays in Timpark/CityApp, public-space reports go to Sesizări. It does not claim live parking occupancy, traffic, public transport arrivals, measured emissions savings or an official partnership.

## FLOW Smart Journey · Sprint 01

The planner now joins **driving → a specific parking → walking to the destination**, alongside genuine
walking/cycling alternatives when ORS is available. Green Switch selects backend-computed rankings;
separate map legs and an interactive timeline stay synchronized. Parking search remains unknown and
excluded, tariff calculations are orientative, and selecting a plan never awards Motion coins.

See [architecture/contracts](docs/complete-journeys.md), [NetRom evidence](docs/challenge-evidence/netrom-glue-it-together.md),
[demo instructions](docs/demo-smart-journey.md) and [actual-user test protocol](docs/user-testing/flow-smart-journey.md).
Live ORS/HeiGIT verification passed through Codex's secure HTTPS proxy on 14 Nov 2026 for driving,
walking, cycling and both parking matrices; see [the verification record](docs/ors-verification.md).
Automated tests use visibly labelled fixtures. Transit routing and a verified cycling overlay remain unavailable.

## What runs

- **Explorează** — local street/place search, real Timpark/OSM parking data, real Timiș county boundary and map controls. Phone bottom sheet and laptop planning sidebar.
- **Parking SmartMatch** — deterministic ranking, distinct parking preferences, known tariffs, estimated walking legs and honest unknowns. Driving time is added only from a configured routing matrix and an explicit GPS/manual origin.
- **Green Switch / FLOW Opportunity** — actual available driving/walking/cycling routes and explained trade-offs. Active routes require ORS; missing providers produce unavailable states, not invented geometries. Selecting a route can open Motion but never awards coins.
- **Motion / Wallet** — foreground GPS recording, deterministic plausibility checks, idempotent server rewards and a browser-bound prototype ledger. The original metallic SVG FLOW Coin has reduced-motion-aware reward animations. DEMO uses a separate balance.
- **Provocări / Comunitate** — achievable activity goals and an explicitly local, opt-in League preview. No fabricated public participants.
- **FLOW City / Data Trust** — public dataset coverage, provenance and deterministic simulated parking allocations, with non-personal exports.
- **Forest Night / Mist Day** — persisted light/dark preference, common components, four primary navigation entries and one wallet control. Motion state stays mounted across internal navigation.
- **Installable shell** — PWA icons, safe built-shell offline cache and an install prompt where supported. APIs, wallet responses, GPS and external map tiles are never put in the service-worker cache.

## Requirements and setup

Use Node.js 20.11+ (22/24 recommended) and **pnpm 12.18.0**, pinned in `package.json`.

```bash
corepack enable
pnpm install --frozen-lockfile
# Only create these files if they do not already exist; preserve your own values.
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
pnpm dev
```

Frontend: port **5173**. Backend: **8787**, proxied through `/api` during development. The committed data snapshots are sufficient to try search, parking and source views; regenerating data is optional. On Windows, use `start.cmd` or `pnpm.cmd` if PowerShell blocks scripts. In the managed cloud, Node 24 requests use inherited proxy trust with `NODE_USE_ENV_PROXY=1 pnpm dev`.

### Configuration

| Variable | Where | Purpose |
|---|---|---|
| `API_PORT` | backend | API port, default 8787 |
| `CORS_ORIGINS` | backend | Allowed frontend origins; comma-separated |
| `ORS_API_KEY` | backend secret, optional | Preferred driving routes/matrix and foot/cycle routes. Without it the app still routes (see below) |
| `VITE_API_URL` | frontend, public | Empty for same-origin `/api`; no secrets here |
| `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `DATABASE_URL` | backend, optional | Reserved optional integrations; core features do not require them |

Without ORS the app still works with real street geometry: driving uses the OSRM public demo, walking and cycling use the FOSSGIS OSRM server (`routing.openstreetmap.de`, profiles `routed-foot` / `routed-bike`). Both are low-volume public services: the backend sends at most one FOSSGIS request per second with a User-Agent naming the team, caches results, fails fast when its queue is full, and the map shows the OSM "fix the map" link their policy asks for ([usage policy](https://routing.openstreetmap.de/about.html)). Set `ORS_API_KEY` for anything beyond a demo. No route is ever drawn as a straight line. Motion itself requires no external provider key. GPS on a physical phone requires **HTTPS**. Browser sensors and Wake Lock are optional; keep activity recording in the foreground.

ORS directions and matrices use `https://api.heigit.org/openrouteservice/v2/`. In Codex, bind the
`ORS_API_KEY` HTTP secret to `api.heigit.org`, preserve the inherited HTTPS proxy and CA trust, and
start Node 24 with `NODE_USE_ENV_PROXY=1`. The proxy supplies the credential for matching HTTPS
requests; never print the binding or put it in frontend variables. This cloud verification does not
configure the separate production server's credentials or network access.

## Map scope and data coverage

The visible geographic scope is the **real Timiș county polygon**, selected by `RO-TM` metadata from Natural Earth Admin-1, public domain. It is a generalized cartographic boundary, not a cadastral survey. Camera bounds derive from that geometry; a polygon mask de-emphasizes outside territory. See [county provenance](docs/county.md).

Official Timpark information and the routing/recommendation service area remain mainly **Timișoara**. Showing other county localities does not invent parking, pricing or transit coverage there. Markers and destination choices are polygon checked; complete provider routes are not clipped and presented as complete journeys.

OpenFreeMap supplies the normal real vector basemap. If unavailable, a clearly labeled local fallback draws **only actual municipal Timpark street/zone geometries**. It has partial coverage and no invented roads, labels or buildings. Search, parking and the county outline can still be demonstrated under restricted networking.

Data snapshots live in `shared/src/data` with source/date metadata. Municipal APIs are read by backend/scripts and snapshotted rather than polled by every user. A parking on a map is not a confirmed free space; unknown prices stay unknown. The occupancy model is an uncalibrated estimate.

## Run the demonstration

1. Search for a real place such as **Piața Victoriei**. Review nearby parking and sources.
2. Choose your origin using GPS or **Alege pe hartă**. Open a parking's route or compare available Green Switch routes.
3. Choose walking/cycling when a real provider route exists and open Motion. No coins are granted for that choice.
4. Record and finish an eligible real activity, or explicitly use **DEMO** for a synthetic visual backup. DEMO coins stay separate.
5. Inspect the wallet, challenges and local community preview. Open **Pentru Primărie** from the menu for public coverage and the labeled FLOW Balance simulation.

The [jury runbook](docs/jury-demo.md) explains the complete scenario, offline limits and what has not been independently verified. Current official sites may be blocked by the cloud network policy; supplied municipal guidance is distinguished from independently checked competition rules. Physical user tests, legal license selection and real-phone validation are not fabricated.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
```

Browser scripts use an installed Playwright and Chromium. In the prepared cloud:

```bash
export PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright
node scripts/test-smart-journey-browser.cjs
node scripts/test-premium-browser.cjs
node scripts/test-motion-browser.cjs
node scripts/test-navigation-browser.cjs
node scripts/test-site-browser.cjs
node scripts/test-pwa-browser.cjs
```

Some browser scenarios intercept routing with **explicit synthetic test fixtures**; they do not prove provider access or a physical walk. `MOTION_LIVE_TEST=1 node scripts/test-motion-browser.cjs` additionally runs about 100 seconds of controlled GPS inputs against the actual server clock, verifying award/idempotency. Real Android/iOS GPS, sensor permissions and usability with residents still require physical testing. There is no lint script in this repository.

## Deployment

Build the frontend, then run the API and compiled SPA on one origin:

```bash
pnpm build
NODE_ENV=production pnpm -F backend start
```

In production, the backend serves `frontend/dist` if present, supports deep-link refresh and retains `/api` routing. Set a real domain pointing to your VM, run Caddy with [the example](deploy/Caddyfile.example), and set `FLOW_DOMAIN` plus the matching `CORS_ORIGINS`. No domain or deployment is claimed to be provisioned by these instructions.

Before a public launch, fill in the data controller and contact e-mail in `privacyContact` (`shared/src/brand.ts`); the privacy page at `/confidentialitate` shows a visible gap until then. Keep Caddy access logs off, or list them on the privacy page if you enable them.

Keep `backend/.data` persistent, private and outside version control. It contains the single-process prototype wallet ledger, not raw GPS traces. Use a transactional database and proper authentication before multi-instance deployment or trusted public rewards. All API keys stay server-side. A static frontend on another host needs a separately configured HTTPS backend; same-origin proxying is recommended for wallet cookies.

## Maintenance and handover

| Command | Purpose |
|---|---|
| `pnpm data:city` | Refresh official Timpark/street/place snapshots; restart backend |
| `pnpm data:parkings` | Refresh OSM parking snapshot |
| `pnpm data:osm-places` | Refresh named streets/major places from OSM |
| `pnpm build` | Type-check frontend, build lazy chunks and prepare versioned public PWA shell |

Likely future owners: Timpark for parking operations; the municipal digital/mobility teams for integration and analysis. Adoption is a proposal, not a partnership. Backend/README setup needs no AI or personally paid map account to demonstrate local data and Motion, but real active routing needs a provisioned provider.

Project code license selection remains a **team decision**, tracked in `docs/team-checklist.md`; this README does not claim an absent MIT/Apache license. Third-party assets/data retain their own terms: OSM ODbL, Natural Earth public domain, provider policies and npm package notices. See [third-party attribution](docs/third-party.md).

Detailed guides: [themes](docs/themes.md), [navigation](docs/navigation.md), [Motion/privacy](docs/motion.md), [Green Switch](docs/green-switch.md), [city handover](docs/city-handover.md), [specification](docs/spec.md).
