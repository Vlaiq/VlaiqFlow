# BIO-PACER STPT — engineering and integration handoff

Status rechecked on **14 November 2026: PARTIAL overall**. The isolated implementation and deterministic
verification are complete. Authentic SMTT data validation and a real pedestrian-provider exercise
remain unverified. There is no frontend, endpoint, deployment or full transit itinerary in this change.
The finalization recheck below records the latest access result and freshly executed quality gates.

## Finalization recheck — updated network configuration

Starting local and freshly fetched remote feature-branch SHA both matched
`16927f52c233d737a317cf0c4dbc4b416426d4be`; the worktree was clean and exclusively checked out on
`feature/stpt-bio-pacer`. No unrelated branch was merged, rebased or cherry-picked. Inspected the
existing transit modules/contracts, ingestion scripts, this handoff and third-party attribution before
rechecking acquisition. Existing scheduling, routing-validation and recommendation algorithms were
preserved; this follow-up changes only this document.

Executed the existing official ingestion command **once**:

```text
Command: node scripts/fetch-smtt-gtfs.mjs
Source: https://smtt.ro/transit/gtfs/maps/smtt-timisoara-ro.zip
Started:   2026-11-14T17:15:38.786984+00:00
Completed: 2026-11-14T17:15:38.916799+00:00
Local time: 14 November 2026, 19:15:38 Europe/Bucharest
Exit code: 1
GTFS ingestion failed: URLError: <urlopen error Tunnel connection failed: 403 Forbidden>
Previous digest preserved. No synthetic timetable was substituted.
```

The runtime still denied the proxy CONNECT request despite the announced allowlist update. This is
not a publisher HTTP 403: no publisher HTTPS response, certificate, ZIP or source metadata was received.
TLS/proxy settings were not bypassed, the URL was not redirected to another domain, and acquisition
stopped after this attempt. The production digest was absent before and after; there was no previous
snapshot to replace. All archive, parsing, memory, provenance and atomic-write safeguards remain intact.

| Finalization evidence | Actual result |
|---|---|
| Authentic archive, checksum, bytes and retrieval timestamp | Unavailable; attempt times above are not a successful retrieval |
| Current version, validity, agency IDs/timezone and calendar coverage | Unknown |
| Stops, routes, trips, stop times, invalid geographic records and actual-feed warnings | Unknown; no dataset was parsed |
| Coverage of 14–15 November 2026 demonstration dates | Unverified |
| Real stop/direction/departure/midnight verification | Blocked by absent authentic feed |
| Real walking route and schedule-backed feasibility | Not exercised; no validated real boarding platform was available |
| Real dataset load/search/memory benchmark | Not run; no real dataset was available |
| Redistribution/attribution terms | Still not independently verified; no source data redistributed |

Routing configuration was inspected without printing credentials or making a provider request.
In this runtime **`ORS_API_KEY` is configured**; configuration presence does not prove key validity or
provider reachability. The checked-out abstraction is `activeRouting.ts` →
`journeys.ts:requestActiveRoute('walk', ...)`, whose configured endpoint is
`https://api.openrouteservice.org/v2/directions/foot-walking/geojson`. If no key is configured, its
existing fallback uses `routing.openstreetmap.de/routed-foot`. This branch does **not** configure an
`api.heigit.org` walking endpoint. Allowlisting `api.heigit.org` does not change this implementation's
endpoint or authorize redirecting its credentials. No key, Authorization header or private coordinates
were recorded, and no shared provider or frontend file was edited.

Fresh verification on 14 November used Node **24.22.1**, pnpm **12.18.0**, Python **3.12.14** and the
unchanged dependency lockfile. The following were executed again, rather than relying on prior results:

| Check | Re-executed result |
|---|---|
| Isolated transit suite | PASS: 108 tests in 3 files (54 feed/calendar/index, 33 Bio-Pacer, 21 archive/CSV) |
| Workspace typecheck | PASS: shared, backend and frontend |
| Full repository tests | PASS: 69 shared + 30 frontend + 180 backend = 279 tests in 31 files |
| Production build | PASS; existing Vite >500 kB chunk advisory remains |
| `git diff --check` | PASS |

Existing regression tests cover corrupted/truncated ZIP and invalid input rejection, last-good snapshot
preservation and atomic replacement, calendar exceptions, midnight/DST, unknown accessibility, provider
errors, timeout-triggered cancellation, later comfortable departures and unavailable timetable handling.
Those are synthetic fixture results, not current SMTT metadata, an actual walk or a real-data benchmark.
No validation was relaxed and no production schedule, coordinates or feasibility figures were invented.

**Integration handoff:** first have the environment owner resolve HTTPS proxy CONNECT access for the
exact official SMTT URL, then explicitly rerun ingestion in that updated environment. Validate current
metadata, date coverage and source terms; use the resulting real boarding platform and active service
date for reproducible departure checks. Only then make one bounded request through the existing
configured walking adapter, keeping the correct provider/credential domain and foot profile, and run
the required real-data load/search/memory benchmark. If the authorized integration is to use HeiGIT,
the integration owner must supply that approved adapter/configuration; this mission does not substitute
domains or merge its branch. The exact later application integration files remain listed below.

This recheck remains **PARTIAL**, with authentic data acquisition blocked. It does not establish
production readiness. The evidence update is committed/pushed only to `feature/stpt-bio-pacer`; the
final response records the new delivery SHA and remote verification. No application was deployed.

## Objective and scope

Help a person in Timișoara compare the time needed to walk to an actual boarding stop with a
published vehicle departure. Prefer a later comfortable connection over an imminent tight one.
Preserve source, timetable validity, walking uncertainty and unknown live operation. Different people
can select different walking speeds and connection buffers. These preferences are not fitness or
accessibility standards.

This is a **stop-access assistant**. A nearby departure is not evidence that its trip reaches the user's
destination. It does not replace SmartMatch, CompleteJourney, HeiGIT routing or CityApp. Existing
`car_park_walk`, `walk` and `cycle` contracts and all frontend components remain unchanged.

## Repository audit and isolation

Base: `origin/main` at `f8ae4747ed36fcbfdce98d7228aeedfac66eaeb6`.
Branch: `feature/stpt-bio-pacer`. Remote: `https://github.com/Vlaiq/VlaiqFlow.git`.
Fetched main and inspected remote heads before creating the branch; no transit branch existed.
No branches were merged. The HeiGIT integration branch was not used as the base.

Read `CLAUDE.md`, `README.md`, `docs/spec.md`, `docs/complete-journeys.md`, `docs/green-switch.md`,
`docs/city-handover.md`, `docs/team-checklist.md`, `docs/third-party.md`, the complete-journey/navigation
schemas, geographic helpers and active-routing/complete-journey/city-data services.
No previous GTFS implementation was found on main. Conventions retained:

- `[longitude, latitude]`, meters, seconds and explicit offset/UTC timestamps.
- Shared Zod contracts, colocated Vitest tests and optional local snapshots with source/date metadata.
- Quality values `confirmed`, `estimated`, `unknown`, `simulated`; missing metrics remain null.
- Inject the existing foot-routing abstraction and reuse its provider policy/cache. The existing
  `walking.ts` matrix/straight-line fallback is **not** an acceptable Bio-Pacer route dependency.
- No new location persistence, routing implementation, npm dependency or shared barrel export.

The team checklist still leaves the submission hour unverified. The official event-site check
(`https://unihack.eu`) was blocked by proxy CONNECT 403 on 14 November. Repository references to
15 November and “Day 3 morning” are not an independently verified official cutoff.

## Actual SMTT evidence and provenance

Official producer URL: <https://smtt.ro/transit/gtfs/maps/smtt-timisoara-ro.zip>.
Reference: <https://gtfs.org/documentation/schedule/reference/>.
SMTT publishes the schedule; STPT and metropolitan operators provide services. No endorsement is claimed.

The initial implementation's fetch command was exercised on **14 November 2026 at 18:45:37 Europe/Bucharest
(16:45:37 UTC)**. It failed with:

```text
GTFS ingestion failed: URLError: <urlopen error Tunnel connection failed: 403 Forbidden>
Previous digest preserved. No synthetic timetable was substituted.
```

| Current official-feed fact | Verified result |
|---|---|
| Successful retrieval timestamp | Unavailable; timestamp above records a failed attempt |
| Archive bytes / SHA-256 | Unknown / unknown |
| Feed version / validity dates | Unknown / unknown |
| Actual agency timezone | Unknown; Europe/Bucharest is expected, not verified |
| Stops / routes / trips / stop times | Unknown / unknown / unknown / unknown |
| Real departure example | Unavailable; no authentic archive was obtained |
| License | Public source identified; redistribution terms not independently verified |

The historical figures in `docs/spec.md` are not current validation results. Accordingly,
**`shared/src/data/smtt-gtfs-digest.json` is deliberately absent**. Startup loading returns
`GTFS_UNAVAILABLE`; no synthetic production fallback exists. Re-run ingestion in an environment with
permitted official-source access, inspect validation warnings and verify redistribution terms before
publishing an actual derived dataset. No live Bio-Pacer validation is claimed.

## Reproducible ingestion

Requirements: the repository's Node/pnpm dependencies and **Python 3.10+**. No pip packages or new npm
dependencies are required. Run from the repository root:

```bash
node scripts/fetch-smtt-gtfs.mjs
```

For a previously retrieved official archive, preserve its original retrieval JSON; do not invent a date:

```bash
node scripts/fetch-smtt-gtfs.mjs --archive /path/smtt.zip --provenance /path/retrieval.json
```

Retrieval JSON must contain `source` (the exact producer URL), `fetchedAt` (offset timestamp),
`sha256` (64 lowercase hex characters), and `archiveBytes`. The CLI recomputes checksum and size.
Offline provenance is an operator assertion; a checksum proves file identity, not publisher authenticity.

Pipeline:

1. Fixed HTTPS URL, identifying User-Agent, HTTP 200, reviewed ZIP content types and ZIP signature.
   Redirects and arbitrary external URLs are rejected. No retries, scraping, polling or user coordinates.
2. Maximum archive 64 MiB, socket timeout 15 s, elapsed download budget 45 s, subprocess deadline 60 s.
3. Python standard-library `zipfile` reads members in memory without extracting paths. Reject absolute,
   drive, backslash, traversal, NUL/truncated names, nested/mixed directory layouts, duplicate paths,
   symlinks, encrypted entries and compression other than stored/deflate. Root files or one containing
   directory are supported. CRC, truncation and declared/actual size are checked.
4. At most 128 entries, 128 MiB per member and 256 MiB total expanded bytes. All text members undergo
   strict UTF-8 decoding with optional BOM. Known GTFS tables are CSV parsed; other members are not
   interpreted as transit data. Linux ingestion workers have a 1.5 GiB address-space ceiling; Node
   ingestion has a 1.5 GiB heap ceiling. Exceeding a limit fails the operation.
5. Python `csv` uses strict quoting and field limits (64 KiB/field, 128 columns, 2 million rows/table).
   Quoted commas, escaped quotes, multiline strings, LF/CRLF, empty values and UTF-8 are supported.
   Duplicate/empty headers, row-width mismatches, malformed quotes and NUL data fail with context.
6. TypeScript validates required columns, scalar values and relational integrity, then normalizes.
   Final schema caps: 50,000 stops, 10,000 routes, 100,000 trips/calendars, 1 million stop times/exceptions,
   64 agencies. Out-of-budget inputs fail rather than partially dropping records.
7. Validate again before writing. Write a unique sibling temporary file, fsync, then same-directory
   rename. Earlier errors preserve the last good digest; temporary files are cleaned up. This provides
   atomic replacement, not a claim of power-loss durability across every filesystem.

No protected manifest or lockfile was changed. Python's maintained CSV/ZIP libraries avoid a custom
ZIP parser. Tables and temporary archive are deleted after the operation. The archive is not committed.
An operator must review CLI output and restart/reload the in-memory index after accepting a new digest.

## Normalized contracts and validation

Direct import contracts from `shared/src/schemas/transit.ts` using a relative path. The package currently
exports only its root; no unsupported `@vlaiq/shared/schemas/transit` import or barrel edit was added.

| Contract | Fields and meaning |
|---|---|
| `TransitStop` | Stable ID, name, nullable `[lng,lat]`, location type, parent, nullable published wheelchair flag |
| `TransitRoute` | ID, agency ID, published names, basic/extended route type |
| `TransitTrip` | ID, route/service, headsign/direction, wheelchair/bicycle flags, optional shape reference |
| `TransitDigest` | Literal schemaVersion 1, metadata, stops/routes/trips, stop-time tuples, calendars/exceptions |
| `TransitFeedMetadata` | Source, real retrieval time, nullable version, effective validity, agencies/timezone, checksum/size, license status, validation warnings/counts/files, quality |
| `ScheduledDeparture` | Stop/trip/route/service IDs, service date and sequence, service-day seconds, exact calculated timestamp, line/headsign/direction, source/version/quality |
| `WalkingAccess` | walk/foot-walking, requested endpoints, actual provider geometry, meters/seconds/source/quality/time |
| `BioPacerRequest` | Explicit origin/start, optional stop/route/direction, walking preferences and bounded search limits |
| `BioPacerResult` | Stops, evaluated options, recommendation ID, requested/evaluated start times, provenance, per-source quality, failures and Romanian limitations |
| `TransitUnavailableReason` | Typed invalid-input/data/date/stop/departure/walking errors |

Stop-time tuple version 1:

```text
[tripId, stopId, sequence, arrivalSeconds|null, departureSeconds|null,
 pickupType, dropOffType, stopHeadsign|null]
```

Both times and order survive for future itinerary development. Unsorted input rows are permitted;
duplicate sequences, backwards times, arrival after departure, missing timed endpoints, and mismatched
arrival/departure pairs fail. Untimed intermediate rows are retained, warned and excluded from exact
departure lookup; no times are interpolated or converted to zero.

Required: agency/stops/routes/trips/stop_times and at least one usable calendar source. `calendar.txt`
may be absent. Duplicate IDs, invalid coordinates/types, bad parent hierarchy, unknown agency/route/trip/
stop/service references, invalid date/weekday/pickup/accessibility/direction values, and count tampering
fail. Only platforms/stops with location_type 0 can have scheduled boarding rows. Parent stations,
entrances, generic nodes and boarding areas are not substituted for routable platforms. Duplicate names
remain distinct IDs. Unknown accessibility flags stay null or published 0 (unknown).

`feed_info.txt` is optional. Published validity is authoritative when present; otherwise derive the
range from calendar dates and added exceptions, with unknown version. Missing directions are warned.
Shapes, if present, have coordinate/sequence/reference validation, then are omitted: no vehicle line
is invented. Non-empty `frequencies.txt` fails explicitly; frequency templates must not be advertised
as exact departures. Flexible pickup windows also fail. This is a scoped schedule validator, not a
complete validator for every optional GTFS extension. Unknown optional files do not create new claims.

## Public functions and indexes

- `normalizeGtfs(tables, provenance)` / `validateDigest(input)`: normalize tables and validate snapshots.
- `parseGtfsTime`, `shiftDate`, `localServiceDate`, `serviceDayEpoch`, `createServiceCalendar`:
  service-time and calendar primitives.
- `new TransitIndex(input)`: validate and freeze one snapshot, construct stop/route/trip maps,
  service/exception maps, sorted per-stop departure arrays and latitude-sorted boarding stops.
- `index.nearby(origin, radiusMeters, limit)`: geographic shortlist with explicitly named
  `screeningDistanceMeters`; never a pedestrian metric.
- `departuresForStop(index, query)`: indexed, calendar-aware scheduled options with typed failure reason.
- `assessDeparture(request, departure, validatedWalking|null)`: deterministic arithmetic; direct callers
  must bind the route to the correct stop. Use `calculateBioPacer` for the validated orchestration.
- `calculateBioPacer(input, index|null, walkingDependency, settings?)`: validate inputs, bound work,
  discover service, obtain/validate walking routes and compare departures. `settings.now` supports
  deterministic tests; production defaults to the actual clock.
- `loadTransitIndex(path?)`: explicit startup/reload hook returning typed unavailable/invalid state.
- `writeTransitDigest(input, target)`: validated atomic snapshot replacement for ingestion/tests.

Do not call `loadTransitIndex` or construct `TransitIndex` per HTTP request. Keep the returned instance
for the process lifetime or replace it after a successful deliberate refresh. The module has no query
cache and retains no user origins. Its read-only maps and frozen data are reused across requests.

## Calendar, midnight and DST algorithms

Times are service-day seconds, accepting H:MM:SS/HH:MM:SS and hours beyond 24, with an explicit
supported cap of 167:59:59. Unsupported larger values fail. A 25:15 departure remains associated with
the previous service date even when its civil timestamp is the following morning.

Exception lookup `(serviceId,date)` overrides weekday/range rules: type 1 adds and type 2 removes.
Without an exception, use the specific service's Monday-first weekday tuple and inclusive start/end
dates. Saturday and Sunday never borrow a weekday schedule. Calendar-dates-only services work.

Use the agency timezone, verified as an IANA timezone. Multiple agencies sharing one timezone are
supported; mixed timezone feeds fail explicitly. Never read the host timezone or a stop-specific
timezone as the timetable clock.

GTFS zero is **local noon of the service date minus 12 elapsed hours**. Resolve local noon with
`Intl.DateTimeFormat` parts, then add the service-day seconds to that epoch. Do not construct a naive
local midnight and add clock labels. In Europe/Bucharest tests:

| Service date | Service-day zero (UTC) | Reason |
|---|---|---|
| 2026-03-29 | 2026-03-28T21:00:00Z | Spring change: local noon is UTC+3 |
| 2026-10-25 | 2026-10-24T22:00:00Z | Autumn change: local noon is UTC+2 |
| 2026-11-16 | 2026-11-15T22:00:00Z | Ordinary winter service day |

For a query, enumerate bounded possible service dates around the requested civil interval, including
prior dates implied by the maximum >24h time and one future date for DST midnight displacement.
For each valid service date, binary-search the stop's sorted seconds, check active service and optional
route/direction, then merge by timestamp, trip ID, sequence and service date. Keep at most the requested
limit per service date before the final limit. Past scheduled options are not recommended. Expired-feed
queries still allow a previous valid service day's >24h departure, if it actually lies in the interval.

## Stop selection and walking dependency

Latitude binary search narrows stops to a geographic band, then the repository's city-distance helper
screens and orders by distance and stable stop ID. Limits: radius 1–3,000 m, shortlist 1–5 (default 3).
Only stops with unconditional, timed boarding service are indexed. Pickup types 1/2/3 are excluded
from normal boarding suggestions; reservation/driver arrangements are not assumed. Route and direction
filters apply before routing. No walking call is made when the shortlisted stop has no valid departure.

The shortlist is geographic, not globally optimal: a farther stop outside the bounded shortlist may
have a better service. A routed result may reveal barriers or a longer detour. After actual routes are
obtained, feasibility and personal pace determine whether any departure is recommended.

`WalkingDependency(from,to,signal)` returns `Promise<WalkingAccess|null>`. It must call the existing
backend foot-routing abstraction; do not duplicate ORS/HeiGIT/FOSSGIS HTTP code. The module checks:

- walk mode and foot-walking profile, finite metrics, timestamp and bounded actual geometry;
- requested endpoints within 1 m, geometry endpoints within 50 m of origin/platform;
- distance not shorter than the geographic separation or implausibly shorter than the geometry;
- nonzero duration when routed distance is nonzero.

The 50 m snapping allowance is disclosed and is not verified platform access. This cannot certify
crossings, step-free access or a provider's underlying map accuracy. Provider timeout defaults to 15 s
(configurable 1–30,000 ms); the deadline returns a typed error and aborts its signal. An adapter must
honor cancellation when possible. If an existing routing function ignores the signal, the caller stops
waiting but its underlying provider work may finish; retain existing caching/queue controls.

## Bio-Pacer math and policy

All units are explicit:

```text
D = provider-routed walking distance (m)
A = (scheduledDeparture - evaluatedWalkingStart) / 1000 - connectionBufferSeconds (s)
requiredSpeedKmh = 3.6 × D / A, only when A > 0
personalWalkSeconds = 3.6 × D / comfortableSpeedKmh
estimatedWalkSeconds = max(providerDurationSeconds, personalWalkSeconds)
```

Unknown routes and nonpositive available time produce null speed, never NaN/Infinity. Non-finite and
out-of-budget inputs fail Zod validation. Request timestamps must include an offset. Starts more than
60 s in the past are invalid; brief transport delays use the later of intended start and calculation
time, explicitly reported. At provider completion, re-evaluate against the current clock and remove
departures whose scheduled time has passed, so provider latency cannot create elapsed walking time.

Defaults: comfortable speed 4 km/h, buffer 120 s and brisk multiplier 1.2; all are configurable.

| Category | Deterministic rule |
|---|---|
| MISSED | Scheduled time is at/before evaluated start |
| TOO_TIGHT | Buffer consumes available time, or the remaining tests fail |
| UNKNOWN | No valid walking route and departure has not already failed the time tests |
| COMFORTABLE | Available time >= estimated walk, and required speed <= personal comfortable speed |
| BRISK | Available time >= estimated walk / multiplier, and required speed <= personal speed × multiplier |

Only comfortable options are recommended. Pick earliest scheduled comfortable departure, then
estimated walking time and stable departure ID. Display all options in scheduled-time order with stable
stop/ID ties. If the recommendation follows an earlier displayed option, set
`NEXT_DEPARTURE_RECOMMENDED`; otherwise `COMFORTABLE`. If none qualifies, return `NONE` with null ID.
BRISK is a descriptive warning, never an instruction to run or ignore signals. No guaranteed boarding.

## Quality, failure handling, privacy and accessibility

Published static schedule: `confirmed`, or `simulated` only in tests/DEMO fixtures. Walking: provider
estimate or explicitly simulated fixture. Feasibility: derived `estimated`, or `simulated` if either
input is simulated. Live operation is always `unknown`. Every departure carries source/version and
the result carries full feed metadata, warnings and calculation time. A published schedule is not
confirmation that a vehicle will be present. Prefer Romanian wording such as “Plecare programată în
aproximativ 3 minute”, never a confirmed live arrival statement.

Typed failures cover invalid requests, missing/invalid/expired data, unsupported date, no nearby stop,
no departure, provider unavailable/timeout and invalid walking route. A failed platform does not erase
another valid option. Missing walking data keeps schedule options with UNKNOWN assessment and an
unavailable result. Invalid disk snapshots are isolated by `loadTransitIndex`; callers pass null for
unavailable data and expose the load reason. This module cannot break parking or navigation because
it is not registered in the current app. No automatic synthetic fallback exists.

No keys, Authorization logs, location histories or personal analytics are added. Coordinates never go
to SMTT. Routes pass only to the existing injected provider and remain request-local in this module;
the existing provider may retain its documented short-lived cache. Future API handlers must use the
existing validation/rate controls and `Cache-Control: no-store`. Review the privacy page only if a new
running personal-data flow is actually introduced.

Unknown wheelchair/vehicle fields do not imply accessibility. No step-free, tactile paving, safe
crossing, accessible boarding or bicycle carriage promise is made. Slow walking preferences and larger
buffers are supported. Explain recommendations in Romanian without pressure and with text quality
labels; do not rely on color alone.

## Performance and resource characteristics

Let S=stops, R=routes, T=trips, N=stop-time rows, C=calendar/exception rows, M=rows for one stop, K=stops
in the latitude band, W=rows visited in the requested departure window, and L=departure limit.

| Operation | Complexity / bounds |
|---|---|
| ZIP/CSV decoding | O(expanded bytes); explicit byte/record/process limits above |
| Normalization/validation | O(S+R+T+C+N log N) worst case from per-trip ordering validation |
| Index construction | O(S log S + N log N + R+T+C) worst case; O(S+R+T+N+C) retained storage |
| Nearby stops | O(log S + K log K), O(K) temporary; worst case K=S, no routing in screening |
| Departure lookup | Per bounded service date O(log M + W); O(L × service-date-count) result storage |
| Orchestration | <=5 walking calls, one per serviced shortlisted stop, concurrent; <=20 departures/stop |

The 167h time cap and <=24h horizon bound service-date enumeration to at most 12 dates around a DST
boundary. Stop/route/trip/service lookups are maps; no full feed scan, parse or fetch occurs per user.
Inactive-service and route/direction filters may still visit all rows in that stop's requested time
window; this is not an assertion of O(1) lookup. No unbounded cache is introduced. Ingestion transients
include decoded CSV and Zod clones; published caps are rejection limits, not claimed memory benchmarks.
**No latency or memory benchmark was run against a real SMTT dataset.** Test durations are not product
latency measurements.

## Verification and acceptance gates

Verified with Node **24.22.1**, pnpm **12.18.0**, Python **3.12** and the unchanged frozen lockfile:

```bash
pnpm -F backend exec vitest run src/services/transit
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Prepared-runtime detail: pnpm was installed under a scratch tool directory. The verification calls
disabled pnpm's redundant dependency pre-run install via `--config.verifyDepsBeforeRun=false` after
the frozen install, avoiding concurrent dependency rewrites. No repository config was changed.

Results: **108 transit tests in 3 executed files**, all passing. Full suites: **69 shared + 30 frontend +
180 backend = 279 passing tests in 31 files**. Typecheck passes all workspaces. Production build
passes, retaining the existing Vite >500 kB chunk advisory. The root build builds the frontend;
backend/shared correctness is separately covered by workspace typechecks/tests.

Coverage includes CSV quoting/encoding, ZIP attacks/corruption/limits, required columns, IDs/references,
stop types/parent rules, calendar-only exceptions, weekdays/weekends, midnight/>24h, both DST changes,
server timezone independence, pickup restrictions, directions/headsigns, multiple routes/ties, response
Zod validity, pace/buffer invariants, timeout/invalid route, later-departure selection, bounded routing,
last-good snapshot preservation and typed no-data behavior. Fixture agencies, schedules and geometry
are explicitly synthetic and isolated; none is an SMTT observation or an on-foot journey.

| Gate | Result |
|---|---|
| A — Repository integrity | PASS: latest main audited, independent branch, protected files untouched |
| B — Official data | PARTIAL: producer access blocked, no authentic digest or real departure example |
| C — Schedule semantics | PASS: deterministic calendar/service-day/DST tests |
| D — Bio-Pacer | PASS for validated dependency contract/arithmetic; real-provider verification unavailable |
| E — Performance architecture | PASS: reused indexes, bounded requests/results, no per-request ingestion |
| F — Quality suite | PASS: isolated tests, workspace checks, full tests and build |
| G — Delivery | Commit/push/remote verification recorded with the final delivery SHA in the engineering response |

## Future integration — exact files and flow

No integration changes were made. An integration agent should:

1. Import schemas directly until separately authorizing an export in **`shared/src/index.ts`** (and
   package subpath exports if desired). Do not silently add a transit category to `CompleteJourney`.
2. Load one index at backend startup. Add a small validated, rate-limited transit-access route with
   no-store responses, and register it in **`backend/src/index.ts`**. Return the module's typed failure
   state when data is missing; leave the existing planner operational.
3. Supply an adapter around **`backend/src/services/activeRouting.ts`** `activeDirections('walk',from,to)`
   or the verified integration branch's equivalent. Map its actual `JourneyOption.route` geometry,
   distance/duration/source to `WalkingAccess`, with the explicit foot-walking profile. Keep its existing
   cache, queue, backend secrets and provider policy. Check cancellation before/after awaiting it if
   that abstraction lacks signal support. Do not reuse matrix fallback estimates as routes.
4. Add the request function in **`frontend/src/services/api.ts`**, called only for an explicit origin
   and intent. Abort superseded requests and prevent stale cards from changing the selected route.
5. Compose one transit-access card in **`frontend/src/features/journey/GreenSwitch.tsx`** and wire state
   in **`frontend/src/app/App.tsx`**. Keep the current comparison/map interaction and per-mode failure
   states. Never claim a complete destination-relevant transit trip from this result alone.
6. Render only returned pedestrian geometry through **`frontend/src/features/map/journeyLayers.ts`**
   and **`frontend/src/features/map/MapView.tsx`**. Keep a platform marker; no animated vehicle from
   static data. Reuse current theme tokens; **`frontend/src/styles/tokens.css`** needs no change.

Card hierarchy: line + known direction; **scheduled** time; stop name; routed meters; estimated walking
minutes; required km/h and chosen buffer/pace; calm recommendation; source/version/retrieval/validity
and unknown live/accessibility state in details. Let the user select a different departure without
rerouting the same stop. Distinguish loading, no origin, no stops, no timetable, no service, no route,
and no comfortable option. Keep text labels, adequate touch targets, readable mobile bottom-sheet and
desktop-sidebar layouts, reduced motion and map-control clearance. No flashing countdown, duplicate
navigation screen or separate transit dashboard.

Existing protected journey/provider services (`routing.ts`, `driving.ts`, `walking.ts`, `journeys.ts`,
`activeRouting.ts`, `completeJourneys.ts`) remain untouched. Existing root manifests, lockfile,
`CLAUDE.md`, shared barrel and listed frontend integration files also remain untouched. Only related
third-party attribution was appended outside the new module files.

## Future park-and-ride and remaining limitations

Retained service IDs, trip directions, both arrival/departure times, ordered stop sequences and pickup/
drop-off restrictions prepare for `walk_to_stop → scheduled_transit → walk_to_destination`. A complete
`drive → parking → walk → transit → final walk` planner still needs real parking/driving access,
destination-relevant boarding/alighting on a valid trip, correct stop order, transfer handling, actual
final pedestrian routing, fare/cost comparisons and treatment of search/wait time. It is not implemented.

Remaining: authentic feed acquisition/validation/digest, real stop/departure evidence, a verified live
walking dependency, license confirmation for redistributed source data, official deadline hour,
frequency/flex/mixed-timezone support if needed, full transit itineraries/transfers/fares, realtime,
frontend/API wiring and real-person/phone accessibility validation. Exact stop access and field safety
cannot be established from this code. The isolated component is ready for review and future integration;
production schedule-backed recommendations require successful official ingestion first.
