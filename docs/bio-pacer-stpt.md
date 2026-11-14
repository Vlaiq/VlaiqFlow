# BIO-PACER STPT — verified offline schedule implementation

**Schedule implementation verified; end-to-end walking validation remains PARTIAL.** The attached
SMTT 4.32 archive has been independently checked and ingested into a committed normalized snapshot.
Real departure queries, calendars and after-midnight service work. The existing walking adapter is
now available as an isolated dependency; its single real request failed, so no real walking distance,
pace or comfortable-connection claim is made. No application integration or deployment was performed.

## Functional delivery and reproducible evidence

Starting branch head: `89f5b1dc8963282b4dde4ea4bd6e4ea4678c08a8`, verified against the freshly fetched
`origin/feature/stpt-bio-pacer`. Work remained exclusively on `feature/stpt-bio-pacer`.

Added/extended functionality:

- `shared/src/data/smtt-gtfs-digest.json`: validated 4.32 schedule, 13,516,086 bytes; no raw ZIP committed.
- Archive provenance accepts an explicitly labelled user-supplied file with `fetchedAt: null`.
  The actual processing time is recorded separately as `ingestedAt`; publisher retrieval is not inferred.
- Publisher and attribution metadata survive normalization. Approximate GTFS `timepoint=0` values
  survive in the optional ninth stop-time tuple field and `ScheduledDeparture.timepoint`.
  Legacy eight-field tuples remain readable and use GTFS's default timepoint=1.
- `walkingAccess.ts:existingWalkingAccess` adapts the existing `activeDirections('walk',...)` result,
  preserving provider geometry, metrics, source, cache/queue policy and cancellation checks. It adds
  no provider request implementation, credential forwarding rule or shared integration change.
- `verifySmtt.ts` runs actual local snapshot examples and a bounded load/search/memory benchmark.
  Network routing occurs only with its explicit `--walking` flag, never in unit tests.
- `smtt.test.ts` exercises the real committed schedule; `walkingAccess.test.ts` covers the adapter.

Machine-readable evidence: [SMTT validation report](data-sources/smtt-bio-pacer-validation.json).
Its 18 example departures were independently matched back to the attached archive's CSV rows,
including stop sequence, service ID, route ID, departure seconds and timepoint flag.

Reproduce local validation/benchmark without a network request:

```bash
pnpm -F backend exec tsx src/services/transit/verifySmtt.ts
```

Add `--walking` only for an explicit single provider exercise. The example planning date is pinned to
this archive; it is not an evergreen current-service check. After the service period, do not reuse it
as evidence of current departures.

Real example, **16 November 2026**, stop **85 — Catedrala Mitropolitană**, `[21.22364,45.75113]`:

| Line | Trip | Direction | Published local time | UTC | Timepoint |
|---|---|---|---|---|---|
| 7 | `7.1_WDSC_T_01_03` | Calea Torontalului (Ciocanul), direction 0 | 08:08 | 06:08Z | 0, approximate |
| 4 | `4.1_WDSC_R_02_02` | Calea Torontalului (Ciocanul), direction 1 | 08:12 | 06:12Z | 0, approximate |
| 2 | `2.1_WDSC_T_05_03` | Calea Torontalului (Ciocanul), direction 0 | 08:14 | 06:14Z | 0, approximate |

These are published schedule values, not observed vehicle movements or live arrivals. The tests
also verify actual Saturday/Sunday services, holiday removal/addition on 30 November, exception-only
vacation service on 23 December, passed-departure rejection, stable ordering and expired/unsupported
query dates. Trip `5c.1_WDSC_T_01_14` at stop 108, sequence 18, has **24:00:00 on service date
20261116**: `2026-11-16T22:00:00Z`, civil midnight at the start of 17 November in Bucharest.

## Real walking request and remaining dependency

Exactly one request used the existing configured ORS foot-walking adapter, from public GTFS stop 91
(Piața Libertății) to platform 85, for a planned start on 16 November at 08:00 Europe/Bucharest.
The runtime's ORS key was configured; the existing endpoint remained
`https://api.openrouteservice.org/v2/directions/foot-walking/geojson`. Credentials were not redirected
to `api.heigit.org`, printed or committed. No alternate provider retry was made.

The request failed with **`fetch failed`**. No provider HTTP status or route response was obtained in
this validation, so a more specific failure cause is not claimed. Bio-Pacer returned
`WALKING_UNAVAILABLE`, `UNKNOWN` options, null routed distance/required pace, and no recommendation.
The implementation did not substitute straight-line distances or synthetic walking geometry.
COMFORTABLE/BRISK/TOO_TIGHT/MISSED policy and next-comfortable-departure selection remain covered by
explicit synthetic route fixtures; they are not a real-provider success claim.

Next integration step: make the existing configured provider reachable with a valid binding, then
repeat one bounded `verifySmtt.ts --walking` exercise. Use `existingWalkingAccess` when composing the
future optional API. No frontend or protected provider file needs to change for this standalone test.

## Measured real-data performance

Measured on Node 24.22.1, Linux x64, AMD EPYC 9V74 in the managed shared cloud runtime, using the
complete 889-stop / 58-route / 13,335-trip / 203,761-row snapshot:

- One local load, JSON parse, full validation, freezing and index construction: **1,203.54 ms**.
- 10 warmups followed by 100 stop-85 queries, limit 20, 16 November 08:00 local:
  median **0.486 ms**, p95 **0.873 ms**, range **0.397–9.106 ms**.
- Process RSS immediately after loading: **350,314,496 bytes** (334.1 MiB); heap used
  **197,318,680 bytes**. Recorded process peak RSS: **375,513,088 bytes** (358.1 MiB).

These are actual single-process measurements, without forced GC, in a shared environment that also
ran tests. They are not a steady-state memory guarantee, smartphone benchmark or production scalability
claim. No speculative optimization or database was introduced. Load once per process, never per query.

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

Declared producer source: <https://smtt.ro/transit/gtfs/maps/smtt-timisoara-ro.zip>.
The user supplied `smtt-timisoara-ro (1).zip`; this runtime did **not** retrieve it from the publisher.
Original download timestamp: **unknown**, represented as null. ZIP modification dates and the
attachment receipt/ingestion time are not substitutes for the original retrieval time.

| Independently verified archive fact | Result |
|---|---|
| SHA-256 | `1f9cfe12ed2b51872dc0c5008387a488eaeec2c88e0b91bd456917e8942fa278` |
| ZIP / expanded sizes | 1,822,565 / 12,147,749 bytes |
| Structure | 14 root-level files, deflate; CRC/UTF-8 and all existing ZIP safety limits passed |
| Feed publisher | SMTT, `https://smtt.ro`, language ro, from feed_info.txt |
| Agency | STPT — Societatea de Transport Public Timisoara |
| Timezone / version | Europe/Bucharest / 4.32 |
| Published validity | **16 November–31 December 2026** |
| Stops / routes / trips / stop times | **889 / 58 / 13,335 / 203,761** |
| Calendar rules / exceptions | 151 / 1,095; 526 additions and 569 removals; 208 referenced services |
| Bad core foreign keys / duplicate primary IDs / invalid stop coordinates | 0 / 0 / 0 |
| Shape points | 41,729, validated then omitted from the schedule digest |
| After-midnight / approximate-time rows | 138 / 188,776 |
| Frequencies | Header-only, zero frequency templates; no unsupported frequency expansion needed |
| Accessibility / bicycles | Wheelchair fields absent: unknown. All 13,335 trips declare bikes_allowed=2 |
| Attribution | SMTT organization declared as authority in attributions.txt; retained in metadata |
| Actual processing timestamp | `2026-11-14T17:57:07.050Z` (19:57:07 Europe/Bucharest) |

**This feed does not cover 14–15 November.** The committed snapshot is useful for planning within
its future published service period, not as a timetable for the hackathon weekend. Expiry remains
checked against service dates, including a prior valid day's after-midnight departure.

The attached bytes match the supplied expected checksum and internally declare the official source's
publisher/agency. That is not a claim of independent publisher HTTPS authentication, official
endorsement or a known original retrieval time. Previous direct-source requests failed at the proxy;
this mission used the uploaded bytes exclusively and made no SMTT download attempt.

The archive contains two fare attributes, 58 fare-rule rows and one agency URL translation. Their
references/content were inspected separately; fares/translations are not implemented in Bio-Pacer.
No unsupported transit extension was silently converted to a departure. Unknown wheelchair access,
approximate timepoints, omitted shapes and unknown live service remain explicit limitations.
Attribution is not a redistribution license: source redistribution terms remain unverified and are
stated as such in metadata and third-party documentation. No municipal adoption is claimed.

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

Provenance JSON must contain `source` (the exact declared producer URL), `fetchedAt`,
`sha256` (64 lowercase hex characters), and `archiveBytes`. For a supplied archive with unknown
retrieval time, use `"fetchedAt": null`, `"acquisition": "user_supplied_archive"` and optionally
`originalFileName`. Do not invent a timestamp. Publisher-download provenance requires a real timestamp;
legacy manifests with a real fetchedAt remain supported. The CLI computes an actual `ingestedAt`
and recomputes archive checksum/size before writing.
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
| `TransitFeedMetadata` | Declared source, nullable original retrieval time, actual ingestion time/acquisition method, publisher/attribution, version/validity, agencies/timezone, checksum/size, license status, validation warnings/counts/files, quality |
| `ScheduledDeparture` | Stop/trip/route/service IDs, service date and sequence, service-day seconds, exact calculated timestamp, line/headsign/direction, source/version/quality |
| `WalkingAccess` | walk/foot-walking, requested endpoints, actual provider geometry, meters/seconds/source/quality/time |
| `BioPacerRequest` | Explicit origin/start, optional stop/route/direction, walking preferences and bounded search limits |
| `BioPacerResult` | Stops, evaluated options, recommendation ID, requested/evaluated start times, provenance, per-source quality, failures and Romanian limitations |
| `TransitUnavailableReason` | Typed invalid-input/data/date/stop/departure/walking errors |

Stop-time tuple version 1:

```text
[tripId, stopId, sequence, arrivalSeconds|null, departureSeconds|null,
 pickupType, dropOffType, stopHeadsign|null, timepoint?]
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
Actual real-data measurements are reported above and in the JSON evidence file. Unit-test durations
are not product latency measurements.

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

Results: **119 transit tests in 5 executed files**, all passing. Full suites: **69 shared + 30 frontend +
191 backend = 290 passing tests in 33 files**. Typecheck passes all workspaces. Production build
passes, retaining the existing Vite >500 kB chunk advisory. The root build builds the frontend;
backend/shared correctness is separately covered by workspace typechecks/tests.

Coverage includes CSV quoting/encoding, ZIP attacks/corruption/limits, required columns, IDs/references,
stop types/parent rules, calendar-only exceptions, weekdays/weekends, midnight/>24h, both DST changes,
server timezone independence, pickup restrictions, directions/headsigns, multiple routes/ties, response
Zod validity, pace/buffer invariants, timeout/invalid route, later-departure selection, bounded routing,
last-good snapshot preservation and typed no-data behavior. The original small fixtures remain synthetic. The added SMTT suite uses the actual committed
snapshot. Provider-error tests use mocks; no successful on-foot journey is claimed.

| Gate | Result |
|---|---|
| A — Repository integrity | PASS: latest main audited, independent branch, protected files untouched |
| B — Official data | PASS for uploaded archive: verified checksum, structure, real digest and examples; original publisher retrieval remains unknown |
| C — Schedule semantics | PASS: deterministic calendar/service-day/DST tests |
| D — Bio-Pacer | PASS for contract/arithmetic; PARTIAL for real walking: one request failed, returning UNKNOWN |
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
3. Reuse **`backend/src/services/transit/walkingAccess.ts`** `existingWalkingAccess`, which wraps
   **`backend/src/services/activeRouting.ts`** `activeDirections('walk',from,to)`
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

Remaining: successful real walking-provider validation, source redistribution/license confirmation,
original download provenance, full transit itineraries/transfers/fares, realtime, frontend/API wiring
and real-person/phone accessibility validation. Unsupported frequency/flex/mixed-timezone feeds still
fail explicitly; this archive does not require those extensions. Exact platform access and crossing
safety cannot be established from this code. The schedule component is a verified future integration
candidate for 16 November–31 December; a complete real walking-to-departure demonstration remains
partial until the configured walking provider returns a valid route. No cross-branch integration,
main merge or deployment was performed.
