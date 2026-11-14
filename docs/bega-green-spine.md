# Bega Green Spine — isolated integration contract

**Status: PARTIAL.** The composable engine, strict contracts, bounded extractor and deterministic
synthetic tests are implemented. The committed production snapshot is **empty / blocked** because
Overpass and OSM egress returned HTTP/CONNECT 403. It intentionally returns `data_unavailable`, spending
zero routing calls. No Bega infrastructure, live alternative, deployment or municipal verification is
claimed. This branch does not wire an API or change the application. Gate C needs real-data/provider
verification after legitimate extraction. See [data evidence](data-sources/bega.md) and
[MapLibre handoff](bega-visualization-handoff.md).

## Public modules

| Module | Exports / responsibility |
|---|---|
| `shared/src/schemas/bega.ts` | `BegaRequest`, `BegaResponse`, `BegaRoute`, `BegaDataset`, `BegaCorridorFeature`, `BegaCoordinate`, `BegaMode`, `BegaInfrastructure` Zod schemas and corresponding named types where needed |
| `backend/src/services/bega/begaEngine.ts` | `createBegaEngine(options)`, `BegaPolicy`; factory returns `calculateBegaAlternative(input, {baseline?, signal?})`, `clearCache()`, immutable `policy` |
| `backend/src/services/bega/begaAdapter.ts` | `adaptActiveDirections(activeDirections)`; `BegaRouteProvider` type |
| `backend/src/services/bega/begaCandidates.ts` | `eligibleForMode`, `discoverBegaCandidates`; topology-aware candidate screening |
| `backend/src/services/bega/begaGeometry.ts` | `lineLengthMeters`, `nearestOnLine`, `lineBounds`, `boundsIntersect`, `isLocalCoordinate`, `measureCorridorOverlap` |
| `scripts/fetch-bega-corridor.mjs` | Explicit bounded one-shot extraction or local raw-source replay; no runtime polling |

Use direct relative imports until the integration owner adds explicit shared package exports. The
package currently exports only its root; `@vlaiq/shared/schemas/bega` is **not** a working package subpath.
No new dependency, ORS client, API key, HTTP fallback or global state is introduced.

```ts
import snapshot from '../../../../shared/src/data/bega-corridor.json';
import { activeDirections } from '../activeRouting';
import { adaptActiveDirections } from './begaAdapter';
import { createBegaEngine } from './begaEngine';

// Example file location: backend/src/services/bega/integration.ts (future, not created).
const bega = createBegaEngine({
  routeProvider: adaptActiveDirections(activeDirections),
  corridorData: snapshot,
});
const result = await bega.calculateBegaAlternative({
  origin: [21.207, 45.7503], destination: [21.2257, 45.7537], mode: 'walk',
});
// Illustrative coordinates, not evidence of an actual route; committed snapshot => data_unavailable.
```

### Routing boundary

```ts
type BegaRouteProvider = (
  mode: 'walk' | 'cycle',
  from: [number, number], to: [number, number], signal: AbortSignal,
) => Promise<{
  mode: 'walk' | 'cycle';
  geometry: [number, number][];
  distanceMeters: number; durationSeconds: number;
  source: string; quality: 'estimated';
}>;
```

`adaptActiveDirections` accepts the existing `(mode, from, to) => Promise<JourneyOption>` and preserves
mode, geometry, distance, duration, source and quality. It checks mode and cancellation on both sides
of the call. Existing `activeDirections()` does not accept a signal; its upstream request cannot be
interrupted by this wrapper. A future HeiGIT adapter can implement `BegaRouteProvider` directly and
honor the supplied signal. The engine keeps the concurrency slot until the actual adapter settles,
including after its deadline. One active adapter that ignores abort may retain its arguments until it
settles; queued abandoned jobs are removed promptly. A permanently stuck adapter blocks new calls rather than spawning
unbounded abandoned calls. No vehicle profile replaces an active profile.

A supplied baseline is a trusted **server-side** `BegaRoute`, never an arbitrary public JSON field.
Reuse a CompleteJourney single active leg by converting its NavigationRoute through the same mapping;
require category, leg type and profile to match. A drive leg or car_park_walk total is not a baseline.
Do not combine Bega metrics with a different baseline ID or a stale request. The engine independently
validates even supplied baselines.

## Contracts and validation

`BegaRequest` is strict: exactly origin, destination, mode, optional maxExtraTimeSeconds (0–900), optional
maxTimeRatio (1–1.5). Request overrides can **tighten**, never loosen, engine policy. Geographic order is
`[longitude, latitude]`, checked against 21–21.5 / 45.6–45.9. Reversed Timișoara coordinates fail. This is
a bounded computational/routing domain, not a coverage claim. Invalid request input throws ZodError
(HTTP 400 boundary); malformed policy throws during factory creation.

Routes require positive finite seconds/meters, estimated quality, nonempty source <=300 characters,
2–12,000 valid vertices, nonzero geometric length, no jump >1,000 m, and geometric/provider distance
agreement within max(20 m, 8% of provider distance). That consistency check is a conservative prototype
filter, not a guarantee of provider edge identity. Origin/destination snaps <=30 m; corridor-anchor
snaps <=10 m; adjacent provider endpoints must differ <=0.25 m. The result retains all three LineStrings
as a MultiLineString and reports both join gaps. No straight connector is created, including within
the numerical join tolerance. Small gaps are a disclosed coordinate-precision approximation.

Dataset validation requires original OSM node identities for every vertex, way/version/timestamp/tags,
source reference, allowed modes, infrastructure classification consistent with tags/modes, unique way IDs,
consistent shared-node coordinates, local bbox containment, ODbL attribution and exact query hash.
Caps are 400 ways / 12,000 total vertices / 100 bounded tags per way. A blocked snapshot must be empty.
Available data is OSM-contributed observation, not an official survey. An invalid snapshot degrades to
`data_unavailable`; it is never repaired with synthetic geography.

Responses are a strict discriminated union. Only `available` has an alternative and requires a
baseline. Other statuses have `alternative: null` and may have a baseline if one was obtained.
Statuses: `available`, `not_relevant`, `no_valid_alternative`, `provider_unavailable`, `data_unavailable`.
Available responses include original segments, exact provider sums, signed deltas, overlap geometry,
entry/exit OSM refs, calculatedAt and integrity/limitations. Cross-field Zod checks enforce metric sums,
mode consistency, geometry identity, ratios and deltas. No unknown numeric overlap is manufactured:
an unmeasurable candidate is rejected with `overlap_unknown` or no qualifying candidate.

Reasons are fixed sanitized codes. Provider network errors, missing profiles/routes, rate limits,
invalid replies, timeouts and bad endpoint snaps become `provider_unavailable`; a geometrically
valid but unqualified route becomes `no_valid_alternative`. When some candidate providers fail and
none qualifies, the provider-unavailable state retains that uncertainty. External exception text,
headers and credentials are never returned. Cancellation returns reason `cancelled`.

## Algorithm and exact units

1. Reject unavailable/invalid data and pre-aborted work before any provider call.
2. Reject origin–destination straight distance <300 m. Require both endpoints within 1,000 m of a
   declared mode-compatible corridor feature. These are inexpensive necessary conditions, never
   sufficient proof of relevance. Validate/reuse or request the correct-mode baseline.
3. Recompute conservative access eligibility from actual tags. Use only footway/cycleway/path;
   omit bridges/tunnels, areas, crossing footways, restricted access, conditional/directional/lifecycle
   or restricted-hour ways. Cycleway implies cycle only; footway implies walk only; other mode/path
   permission must be explicit. This excludes potentially valid routes rather than guessing.
4. Build an undirected graph only from original shared OSM node IDs; nearby opposite banks or
   distinct nodes at the same coordinate never connect. Prefer actual way endpoints/shared nodes/
   junctions. Select four nearest entry and four exit nodes, perform <=4 bounded Dijkstra searches,
   evaluate <=16 ordered pairs and retain <=2. Require forward geographic progress, >=250 m eligible
   network travel and straight-access + graph-distance <=1.35 × baseline distance. This screening
   lower bound ignores turns/barriers and cannot itself establish accessible approaches.
5. For each candidate, request origin→entry, entry→exit, exit→destination sequentially, always using
   the requested mode. Validate every response and snapped endpoints; reject discontinuous joins.
   Cache/coalescing can reuse identical segments. Three actual provider routes are required;
   there is no fabricated zero-length leg or synthetic connection when an endpoint equals an anchor.
6. Reject excessive provider time/distance. Measure overlap for the baseline and each candidate
   segment against eligible mapped paths. The middle leg itself must have >=80% geometric overlap.
7. Accept only >=250 m total overlap, >=20% provider-distance share and >=100 m overlap improvement
   over baseline. Thus an already equivalent Bega baseline is not advertised as a new green benefit.
8. Rank qualifying routes by duration ascending, distance ascending, overlap descending, then stable
   `entryNodeId:exitNodeId` string order. This is deterministic among the bounded candidates, not a
   citywide optimum. No safety or pollution score influences selection.

Let D and L be meters, T be seconds. We preserve full precision internally:

```
deltaTimeSeconds     = T_bega - T_base
deltaDistanceMeters = D_bega - D_base
timeRatio           = T_bega / T_base
corridorShare       = L_corridor / D_bega
```

Positive delta time means **extra** travel time. Negative means faster. Positive distances are required,
so neither ratio divides by zero. The deterministic Romanian template rounds minutes and kilometers
only for prose; display cards should use the exact numeric fields for rounding. A near-zero time delta
is described as approximately equal, never an invented saving.

### Length-based map-matching approximation

Use a fixed equirectangular metric plane centered at (21.25,45.75). Within the validated domain its
E/W scale differs by <0.28% from the repository's spherical distance formula; lengths use the shared
`distanceM` formula. Each mapped segment is buffered by a finite capsule of radius 6 m. For each
provider segment, analytically intersect its parameter interval with each capsule (strip + endpoint
disks), require absolute direction difference <=20° (reverse travel allowed), and union all intervals.
Sum `length(providerSegment) × coveredFraction`. The union prevents duplicate/parallel OSM records
from double-counting any part of the route. Clipped output is interpolated **on returned provider
segments** solely to mark measured portions, never between different routes.

Perpendicular bridge crossings receive no match. Opposite banks/parallel roads farther than 6 m
receive no match. Distinct eligible infrastructure or unrelated paths within 6 m remain geometrically
ambiguous without provider edge IDs. Endpoint disks can extend a match by up to 6 m per mapped endpoint;
thresholds and the middle-leg rule reduce intersection-only claims. This is documented approximate
map matching, not proof of physical protection or measured air quality. Invalid inputs or exhausted
comparison/reference budgets return null/unknown. No vertex sampling or unbounded densification occurs.

Each overlap call has a 1,000,000 segment-comparison budget and the same reference-attribution budget;
there are at most seven such calls per analysis. Raw geometry helpers permit larger bounds for tests,
but production schemas enforce the tighter caps above. The implementation uses a bounded direct scan;
no spatial-index benefit has been measured or claimed. Large snapshots may conservatively exhaust the
budget and produce no alternative. Fully matched geometry slightly longer than provider distance is
also rejected rather than silently clamped to fabricate a <=100% share.

## Policy sensitivity and performance

All values are prototype engineering/product choices, **not research-backed official recommendations**.
They are deliberately conservative pending field/provider evidence.

| Default | Purpose and sensitivity |
|---|---|
| 2 candidates | Hard provider-budget cap; lowering reduces coverage/calls |
| 1,000 m access | Necessary relevance bound; enlarging admits longer approaches |
| 300 m minimum journey | Avoid impractical short-trip detours; lowering admits trivial trips |
| 250 m overlap/network; 20% share | Require material mapped infrastructure; increasing reduces recall |
| 100 m overlap gain | Avoid a near-identical alternative; raising suppresses useful small improvements |
| time ratio 1.35; distance ratio 1.35; extra time 300 s | All must pass; tighter values favor practical trips |
| tolerance 6 m; heading 20° | Provider/OSM geometry allowance; larger values increase false-match ambiguity |
| snap 30 m / anchor 10 m; join 0.25 m | Reject mis-snaps/disconnected legs; tighter values reject more provider rounding |
| provider deadline 12,000 ms | Includes queue time; caller may tighten via engine construction (10–15,000 ms) |
| 32 cached routes, 60,000 ms TTL | Exact directed coordinate+mode key; memory-only, no persistent route history |

Cold worst-case budget: **1 baseline + 2 candidates × 3 segments = 7 calls**; a supplied baseline reduces
this to 6. Screening with missing data, short/outside journeys makes zero calls. At most four concurrent
analyses, one active provider call, eight waiting slots and 12 distinct pending route jobs per engine.
Theoretical serial provider waiting bound for seven calls at the default deadline is 84 seconds, excluding
bounded synchronous processing. Integration should supply a caller AbortSignal with a product deadline
(e.g. 30 seconds) and accept partial unavailability; never advertise a guaranteed latency.

The existing provider adapter retains its own shared FOSSGIS throttle and ORS infrastructure. One Bega
engine per process is required to maintain these engine limits; creating one per HTTP request defeats
caching and cross-request concurrency limits. Upstream infrastructure must still enforce a deployment-
wide budget across other workstreams/instances. No retries are made. This is a prototype component,
not a provisioned public routing SLA.

Cache contains only validated route results, not failures or entire responses; entries are exact-
coordinate, directed and mode-specific. Each entry has a bounded expiry timer that deletes its route
reference after at most the TTL (subject to normal event-loop scheduling); eviction/replacement and
`clearCache()` cancel those timers. No idle expired entries are retained indefinitely. Garbage collection
and provider-owned caches are outside this module's erasure guarantee. Repeated identical routes coalesce;
responses are cloned so a caller cannot poison the cache. Shared jobs stop when their last interested
caller cancels; one caller's cancellation does not cancel another caller. Queued abandoned jobs are removed immediately and do not
invoke the provider. Cancellation is checked before each segment and cached return. No request or
location logging exists. HTTP integration must use `Cache-Control: no-store` and exclude responses from
service-worker caching. Privacy handoff must describe the temporary backend cache before activation.

## Exact future integration work (not applied here)

1. `shared/src/index.ts`: add explicit named schema/type exports from `./schemas/bega` (take care to
   export Zod value and inferred type names together). Do not change CompleteJourney in this branch.
2. Add `backend/src/routes/bega.ts`: instantiate one engine with the existing activeDirections adapter
   and snapshot; POST `/alternative`, `BegaRequest.safeParse(req.body)`, 400 on validation errors,
   `Cache-Control: no-store`, await engine and serialize only `BegaResponse`. Set a 30-second abort
   deadline and abort on response close if `!res.writableEnded`; remove listeners/timers in finally.
   Do not accept client baselines, policies, snapshots or URLs. Keep the existing JSON body cap and
   introduce a route-specific <=2 kb parser before broader middleware if choosing a tighter cap.
3. `backend/src/index.ts`: import the new router; mount
   `app.use('/api/bega', limited(30), begaRouter)` before the final `/api` 404 handler. Keep all existing
   limiter/TLS/error/privacy behavior. `limited(30)` is a proposed local endpoint limit, not a provider
   entitlement. Coordinate overall routing budget with the HeiGIT owner.
4. Optional composition in `backend/src/services/completeJourneys.ts` / `backend/src/routes/journeys.ts`:
   reuse the already computed matching walk/cycle baseline and return a **separate** BegaResponse,
   keyed to request/mode/selected baseline. Do not add duplicate route totals or relabel a compound
   car route. A Bega alternative has up to three active segments whereas current CompleteJourney
   expects a single active leg; do not cast MultiLineString to NavigationRoute or insert connectors.
   Keep this result alongside the existing complete response until a separately reviewed contract
   extension supports the segmented geometry. Existing ranking semantics remain the integration
   owner's responsibility; Bega's time comparison is with the active baseline, not auto+parking.
5. `frontend/src/services/api.ts`: add typed POST helper with AbortSignal and no persistent cache.
   `frontend/src/features/journey/GreenSwitch.tsx`: request contextually for selected walk/cycle,
   retain request identity/cancel stale work and present exact signed time/distance tradeoff.
   `frontend/src/app/App.tsx`: connect selection callbacks/context to the one existing map.
6. `frontend/src/features/map/MapView.tsx` and `journeyLayers.ts`: add exact sources/layers described
   in the handoff, preserve map instance/theme reload behavior, camera padding and reduced motion.
   No separate Bega screen or frontend app is required.
7. `frontend/src/features/trust/PrivacyScreen.tsx`: disclose this additional temporary location cache
   and any provider changes before enabling the feature, following CLAUDE.md rule 14. Dataset
   extraction sends no personal route information. Existing provider identity may change with
   HeiGIT work and must be reflected rather than assumed.
8. Refresh data in an allowed environment, validate Zod, inspect original OSM feature histories and
   map association, then execute one bounded real Timișoara walk/cycle test through provisioned routing.
   Preserve source identity, original geometry and measured results. Do not enable based solely on
   synthetic tests or remove acceptance thresholds to obtain a demonstration.

No changes are needed in `routing.ts`, `driving.ts`, `walking.ts`, `journeys.ts` provider code,
`activeRouting.ts`, package manifests/lockfile, CLAUDE.md, global styles or design tokens to use the core.
The main integration owner may choose the composition points above after reconciling concurrent work.
No merge into main or the HeiGIT branch is part of this delivery.

## Verification commands and evidence boundaries

```bash
pnpm install --frozen-lockfile
pnpm -F backend exec vitest run src/services/bega
pnpm -F shared exec vitest run src/schemas/bega.test.ts
node --test scripts/fetch-bega-corridor.test.mjs
pnpm typecheck
pnpm test
pnpm build
```

Unit/integration tests inject synthetic geometry/mock routing; they prove contracts, modes, topology,
length math, call budgets and failure handling. They do not prove city data, provider access, physical
safety or mobile usability. The actual results, commit and gate statuses are recorded in the delivery
report. Full frontend browser/real-phone checks are unexecuted because this mission adds no frontend
integration. No live API key or route history is committed.

## Licensing and provenance

Uses already-present TypeScript, Zod and Vitest dependencies and repository geo utilities. Original
code, no copied external algorithms/source or added third-party package. Existing `docs/third-party.md`
already records OpenStreetMap ODbL, Overpass and routing providers; Bega-specific obligations are detailed
in `docs/data-sources/bega.md`. Display “© OpenStreetMap contributors”, snapshot date, provider and text
quality labels; link https://www.openstreetmap.org/copyright and obey ODbL derived-database obligations.
No municipal endorsement, safety certification, measured pollution or new environmental score exists.
