# Bega Green Spine — delivery and verification report

## A. Executive status — PARTIAL

Implemented an isolated walk/cycle routing engine, strict Zod contracts, existing-activeDirections
adapter, topology-aware candidate discovery, length-based corridor matching, bounded data extraction,
184 new deterministic tests and backend/UI integration documentation. Production data retrieval is
blocked. The committed empty snapshot returns `data_unavailable` with zero provider calls. No live
Bega alternative, integrated feature, deployment or physical safety validation is claimed.

| Gate | Result | Evidence |
|---|---|---|
| A — branch integrity | PASS | Dedicated worktree/branch from fetched origin/main; original checkout preserved |
| B — geographic dataset | PARTIAL | Real source attempts blocked; reproducible extraction and honest empty snapshot |
| C — routing intelligence | PARTIAL | Connected geometry/matching/detour behavior verified with synthetic injected providers; live city/provider evidence unavailable |
| D — software quality | PASS | Strict typecheck and 184 new tests pass |
| E — repository regression | PASS | Typecheck, 337 repository tests and frontend production build pass |
| F — parallel safety | PASS | Only isolated Bega code/data/scripts/docs added; protected modules unchanged |
| G — delivery | See verified remote ref | Local commit/push/remote identity are completed and reported in the delivery response; resolve the branch link below for the exact SHA |

## B. Branch and delivery

Base: `origin/main` at `f8ae4747ed36fcbfdce98d7228aeedfac66eaeb6`, fetched before work.
Dedicated branch: `feature/bega-green-spine`.
[GitHub branch](https://github.com/Vlaiq/VlaiqFlow/tree/feature/bega-green-spine).
Final commit SHA and verified push/clean-tree state accompany the delivery response; a commit cannot
embed its own content-addressed SHA. The original `/workspace/VlaiqFlow` checkout stayed on branch
`work` at `bcbeb88ff391af4053f645f254e5cd86bd794e3e` with no changes. No main/HeiGIT merge or force-push.

## C. Research and data

[Full provenance and attempts](data-sources/bega.md). Source: OpenStreetMap via bounded Overpass
extraction, intended bbox `[21.175,45.735,21.255,45.765]`. Overpass primary returned HTTP403;
Kumi/private.coffee and OSM map API received CONNECT403. No actual OSM object/geometry was retrieved.
Failed-attempt timestamp: `2026-11-14T16:24:16.963Z` (18:24 Bucharest); upstream snapshot date is unknown
(`osmBaseTimestamp: null`). Production features: zero, status blocked. Query SHA-256 after narrowing to
footway/cycleway/path: `10872d762f1276f6b9002d95f0c967ac4bedfdba5f2ea3de0a8a3871845b7213`.
OSM attribution/license: © OpenStreetMap contributors, ODbL-1.0. Intended coverage names are research
areas, not verified anchors. Real data must be extracted and geographically inspected before use.

## D. Architecture

[Complete public contract](bega-green-spine.md). `createBegaEngine({routeProvider,corridorData,policy?,now?})`
returns `calculateBegaAlternative(request,{baseline?,signal?})`, `clearCache()` and immutable policy.
`adaptActiveDirections(activeDirections)` preserves existing navigation geometry/metrics without a
new routing client or key. BegaRequest/Route/Dataset/Response validate local coordinate bounds, modes,
positive metrics, provenance, resource limits and response arithmetic. Geometry, candidate and
adapter modules are independently testable. No global API/shared export/frontend integration applied.

## E. Algorithm

Cheap length/proximity screening precedes new provider work. Eligible footway/cycleway/path graph
connects only identical OSM node IDs. Four entry/four exit anchors, <=16 pairs, <=4 shortest-path
searches and <=2 candidates. Three real mode-correct provider segments per candidate; endpoint snaps
and <=0.25m join precision are checked, with original segment boundaries retained as MultiLineString.
No synthetic connector is drawn. Middle leg requires >=80% mapped overlap.

Analytical union of provider-segment/corridor-capsule parameter intervals measures length, with 6m
tolerance and <=20° alignment. Duplicate mapped geometries cannot inflate route coverage. Crossings
are filtered by heading. Thresholds: >=250m corridor, >=20% share, >=100m gain over baseline, <=1.35
time/distance ratios and <=300s extra time. Policy is a prototype choice, not an official standard.
Rank by time, distance, overlap descending, stable entry/exit node key. Provider failure/timeout,
invalid geometry, unknown overlap and excessive detours fail honestly.

Units: T seconds, D/L meters.
`deltaTimeSeconds=T_bega−T_base`; `deltaDistanceMeters=D_bega−D_base`;
`corridorShare=L_corridor/D_bega`; `timeRatio=T_bega/T_base`.
Positive time delta is extra time. No pollution/safety score.

## F. Actual checks — 14 November 2026, approximately 18:35 Bucharest

| Check | Actual result |
|---|---|
| `pnpm typecheck` | PASS: shared, backend, frontend strict TypeScript |
| `pnpm test` | PASS: shared 112 + backend 195 + frontend 30 = **337 tests**, 32 files |
| New Vitest tests | **166**: engine/adapter 55, geometry 29, candidates 39, schemas 43 |
| `node --test scripts/fetch-bega-corridor.test.mjs` | PASS: **18** additional converter tests |
| Total executed test cases | **355**, including **184** new Bega-specific cases |
| `pnpm build` | PASS; Vite emits the existing >500kB chunk-size warning |
| `node --check scripts/fetch-bega-corridor.mjs` | PASS |
| Shipped-snapshot smoke | PASS: schema-valid data_unavailable, providerCalls0, baseline/alternative null |

The 55 orchestration/adapter tests include injected mock integration against BegaResponse, exact
metrics/signs, source preservation, geometry/mode/access/overlap/detour rejection, stable two-candidate
ranking, cache mode/isolation/expiry/eviction, call budgets, timeout, coalescing, cancellation races,
12 sequential abandoned queue entries and recovery after an unresponsive adapter. Existing tests
were not weakened or modified. Tooling actually used: Node24.22.1, available pnpm11.25.0, Vitest2.1.9.
The repository declares pnpm12.18.0; frozen installation and all required commands succeeded with the
available runner. No manifests or lockfile changed. Real routing, browser integration and physical
Android/iPhone tests were unexecuted; synthetic tests do not replace them.

## G. Real routing evidence — BLOCKED

No real Timișoara origin/destination route or measured baseline/alternative/overlap is reported.
Example coordinates in documentation are illustrative and are not live evidence. Per the mission's
conditional live-test requirement, no routing calls were spent after production dataset acquisition
failed. Required future evidence: source-backed snapshot, correct-profile provider geometry, connected
segments, consistent metrics and measured qualifying overlap under unchanged acceptance rules.

## H. Performance

Worst-case provider budget **7** (baseline 1 + candidates 2 × segments 3), or **6** with supplied baseline. Zero
calls for missing data/short/outside journeys. Four analyses, one actual provider call and eight queued
slots per engine; raw calls keep their slot until actual settlement even after timeout. No retries.
Cache: 32 exact directed + mode keys / 60 s; validated routes only, timer-driven expiry, bounded eviction,
coalescing, cloned results and `clearCache`. All-consumer cancellation removes queued jobs promptly.
Each overlap invocation caps comparisons and attribution work at 1,000,000; <=7 invocations per analysis.
Extractor: one request /45s /8MiB response, final <=400 features/12k vertices. No live latency/throughput
benchmark or spatial-index speedup is claimed. These are per-engine/per-process limits; deployment-
wide provider policy still belongs to existing routing infrastructure.

## I. Security and data integrity

No credentials/env binding added or exposed. No untrusted arbitrary URL fetch, TLS weakening, route
history logs or persistent location store. No invented production geography, pollution statistics or
unsupported safety claims. Cache lifetime and an active non-settling provider's retention limitation
are documented. All fixtures are explicitly synthetic and isolated from the production JSON.
Protected modules, HeiGIT/School Shield work, main, manifests and global design files remain unchanged.

## J. Future integration contract

[Backend/API/composition handoff](bega-green-spine.md#exact-future-integration-work-not-applied-here)
and [precise MapLibre/responsive/accessibility handoff](bega-visualization-handoff.md).
Future integration owner adds shared exports, isolated backend router/index mount, optional matching
CompleteJourney baseline reuse, API client/hook, GreenSwitch/App selection and MapView/journeyLayers.
Update PrivacyScreen before enabling location processing. Preserve multipart provider geometry and
keep Bega analysis alongside the current single-active-leg CompleteJourney contract. Use three map
sources: ordinary route, alternative, actual measured overlap. One mounted map, exact signed tradeoff,
source details, theme/reduced-motion support and existing Motion handoff; route selection grants no coins.
Exact file list and proposed patches are in the handoffs. No provider rewrite is needed.

## K. Remaining limitations

No acquired corridor coverage or inspected OSM ways; conservative exclusions can omit valid bridges,
directed paths and accesses. No barriers/turn-relation extraction or field inspection. Provider mode
and network uncertainty remain. Geometric matching cannot disambiguate parallel infrastructure within
6m without provider edge IDs; endpoint caps have bounded approximation error. Numerical joins do not
certify physical access. Geometric/provider metric differences can conservatively reject full matches.
Bounded candidates are not a global optimum. A provider ignoring abort forever blocks its engine;
properly settling upstream deadlines are required. Physical safety, lighting, pollution, wheelchair
access, municipal endorsement and an integrated/deployed feature are not certified or claimed.

## L. Next required step

Ready for **independent adapter/contract integration testing with explicit mocks**. Real-data end-to-end
acceptance remains blocked until legitimate extraction, geographic review and provisioned active routing
are available. Then run one bounded real Timișoara test and preserve evidence. The integration owner
can connect the documented hooks afterward. Do not merge this branch into main as part of this mission.
