# FLOW CITY and data handover

FLOW CITY (`/city`) is a possible municipal pilot workbench. FLOW DATA TRUST (`/data`)
is the citizen-facing provenance register. Neither screen claims an official partnership,
citywide real-time occupancy, a deployed public-sector service or field research that did
not happen.

## What is implemented

- Coverage counts from the actual app API snapshots: OSM parking IDs, official Timpark
  zones/lots/streets, OSM records with a capacity value, and local destinations.
- Unique IDs **within each source**. OSM parking records and municipal geometries are not
  summed into one parking total because cross-source identity linkage is not established.
- Source, snapshot date and municipal version where returned by the API. Dates are shown
  in Europe/Bucharest. A successful API response is not evidence that remote providers
  are healthy or that the source is real-time.
- FLOW Balance, a deterministic synthetic allocation comparison. Both strategies use the
  same virtual drivers and three virtual parking capacities. Both respect capacity and
  can leave drivers unassigned. Nearest-first minimizes driving time among available
  candidates. Balanced allocation minimizes drive + walk + `8 × load ratio` minutes.
  Every numeric route cost in this experiment is an explicit synthetic assumption.
- JSON/CSV exports of non-personal aggregate coverage and provenance. A separate JSON
  export preserves the simulation inputs and both computed outputs for reproducibility.
- An expandable “De unde provin datele?” card reusable beside a recommendation.
- A secondary diagnostic view for API/configuration status. Configuration presence is
  deliberately distinguished from a successful request to a routing provider.

FLOW Balance is not a measured SmartMatch impact study. It does not claim fewer city
traffic jams, shorter observed search times or avoided emissions. The calculated trade-off
may favor either strategy. A measured pilot needs a defined baseline and actual observations.

## Actual data sources and limitations

| Source | What it supplies | Important limitation |
| --- | --- | --- |
| City Hall Timpark endpoint | Zones, parking lot geometries, street segments, tariffs, version | Primarily Timișoara. A feature is not one parking space or one free space. |
| OpenStreetMap / Overpass snapshot | Parking positions, access tags, some capacities | ODbL 1.0 attribution; contributor tags may be partial or stale. |
| City Hall register / landmarks and OSM place snapshots | Searchable streets and destinations | Point precision varies and is labeled by the existing search system. |
| openrouteservice / OSRM | Provider route geometry and estimated route metrics | No traffic feed; ORS key/access may be unavailable. OSRM demo is not a walk/cycle router. |
| SMTT timetable | Not connected to this provenance workbench | No live arrival claims, wheelchair routing or bike-on-transit promise. |

Official guidance: <https://ghid-pmt.vercel.app/unihack>. Existing third-party terms are
documented in `docs/third-party.md`; the original attachments are requirements, not proof
of access to a remote API. Timpark tariff units are preserved as published. The app does
not invent a conversion rate or interpret unknown cost as zero.

## Suggested institutional ownership

Timpark could own parking identities, capacities and operational observations. Municipal
mobility/digital teams could own planning assumptions and aggregate analysis. This is a
handover proposal, not an adoption or partnership claim.

A pilot would benefit from verified Timpark↔OSM links, dated anonymized occupancy
observations, manual counts and tests with residents. An actual citywide activity indicator
would require opt-in aggregation, purpose limitation and minimum group-size protections;
this workbench currently reads **no** individual wallets, GPS sessions or movement traces.

FLOW Vision AI is not implemented. Camera access, authorized footage, detector/model
licenses and calibration are prerequisites. No fake video or synthetic occupancy is fed into
the real parking datasets.

## Reproduce and run

Use the repository's pinned pnpm and supported Node version:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

The prepared cloud sets `PATH=/workspace/.tools/node_modules/.bin:$PATH` and, with Node 24,
`NODE_USE_ENV_PROXY=1` for requests through its inherited network proxy. Frontend port
5173 proxies API requests to backend 8787. No new dependencies, external fonts or model
downloads are needed for these screens.

For a real deployment, serve the frontend build with SPA history fallback and proxy `/api`
to the backend on the same HTTPS origin. Run the backend with `pnpm -F backend start`,
set the existing environment variables from `.env.example`, and restrict CORS to the
actual frontend origin. HTTPS is required for phone geolocation. Keys remain server-side.

Existing Motion wallet persistence is single-process prototype storage in the ignored
`backend/.data` directory; mount persistent storage and follow `docs/motion.md`. Do not
publish that private state in JSON/CSV exports. A scaled multi-process public deployment
needs proper authentication and transactional database storage.

## Refresh data deliberately

`pnpm data:city`, `pnpm data:parkings` and `pnpm data:osm-places` refresh existing public
snapshots. These are operator actions, not per-user calls or polling loops. Respect provider
network access and terms. Read output, validate the source date/version and known coordinates,
then restart the backend. A newly generated file is not proof its contents are correct.

Before a demo, re-check the SMTT timetable version if transport planning is being introduced.
The supplied municipal guide notes frequent timetable changes and missing accessibility
fields. Old bike-lane datasets must retain their source year; no bike layer was silently added.

## Acceptance and remaining human work

The simulator tests verify deterministic results, driver conservation, no capacity overflow,
empty-demand handling and input validation. Coverage tests verify within-source deduplication,
unknown-vs-empty semantics and coordinate-free aggregate exports.

Physical-device checks, field counts and interviews remain human tasks. Record actual
findings in `docs/user-testing/`; do not infer that code tests replace residents using the app.
The project code is MIT-licensed (`LICENSE`, decided 14 Nov 2026). Data and dependencies keep
their own licenses (`docs/third-party.md`).
Choose one pilot outcome with a measured baseline (for example, total journey time to a
selected destination), rather than deriving citywide impact from a simulation.
