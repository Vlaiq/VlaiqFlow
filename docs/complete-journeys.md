# FLOW Smart Journey

A complete journey has a real origin, a destination, ordered provider-routed travel legs and explicit
unknowns. `car_park_walk` means drive **to a specific parking**, a parking event, then pedestrian routing
**from that parking to the destination**. It does not mean a direct driving route with a walking label.

## Contracts and units

`shared/src/schemas/completeJourney.ts` is the single Zod/TypeScript contract for both sides:

- `CompleteJourneyRequest`: required `[longitude, latitude]` origin/destination; optional `arriveAt`
  (ISO timestamp used for tariff context), `stayMinutes` 15–600, `maxWalkMinutes` 2–20,
  `parkingPreference` balanced/cheap/less_walk, `preference` fastest/balanced/green and unique supported
  `modes` car_park_walk/walk/cycle. Unsupported transit, missing coordinates and extra fields are rejected.
- `JourneyLeg`: drive/driving-car, walk/foot-walking, cycle/cycling-regular with original geometry,
  provider source, seconds/meters and requested endpoints; or a stationary parking event with unknown
  duration. Unknown metrics have `value: null, quality: unknown`; a numeric unknown zero is invalid.
- `CompleteJourney`: stable hash ID, endpoints, leg order/continuity, exact sums of provider seconds
  and meters, route-leg time versus elapsed time, parking tariff context, practical flag and limitations.
- `JourneyMoney`: integer minor units, ISO currency when a positive amount is known, provenance and
  note. Zero from OSM fee=no may have no currency. Unknown is null. No FX conversion is performed.
- `CompleteJourneyResponse`: up to three car alternatives plus walk/cycle, all three backend-computed
  rankings, unavailable-mode reasons, optional real-comparison opportunity and calculation timestamp.
- `ActiveJourneyContext`: strictly validated planned mode/destination/distance/duration/source/time.
  It carries no GPS samples or reward instructions and is never accepted as a recorded activity.

The service rejects provider geometry endpoints more than 250 m from the requested endpoints.
Smaller snaps are a disclosed routing tolerance, **not** a surveyed accessible entrance or safe crossing.
A syntactically valid line alone is insufficient: each adapter uses the appropriate upstream profile.

## API

`POST /api/journeys/complete` accepts strict JSON, for example:

```json
{
  "origin": [21.207, 45.7503],
  "destination": [21.2257, 45.7537],
  "stayMinutes": 120,
  "maxWalkMinutes": 12,
  "parkingPreference": "balanced",
  "preference": "balanced"
}
```

These are geographic example points, not evidence of a successful live route. No demonstration origin
is substituted for a missing user origin. Routing coverage remains the prototype Timișoara rectangle
21–21.5 longitude / 45.6–45.9 latitude; the real county map does not expand routing coverage.

Responses: 200 for a valid comparison, including honest empty/partial results; 400 for invalid or
out-of-coverage input; 503 for unavailable/busy orchestration. The endpoint sets `Cache-Control: no-store`.
Existing `/api/recommendations` and `/api/journeys/compare` remain compatible.

## Reused orchestration

1. Extracted `recommendParkings` from the existing Express handler without changing its contract.
2. SmartMatch builds candidates from real municipal Timpark and OSM snapshots, caps screening at 30,
   requests one driving and one foot matrix when ORS is configured, ranks and returns up to five.
3. Complete-journey screening excludes customers-only parking. Unknown access remains explicitly
   unconfirmed. Existing containment deduplication is preserved; mere proximity no longer drops a
   separate OSM parking. Containment itself remains a heuristic, not verified cross-source identity.
4. Balanced screening uses available matrix drive+walk totals, then SmartMatch cost and stable IDs.
   Other parking preferences reuse SmartMatch screening. The walk formula fallback can only screen;
   it never supplies the geometry or duration of a complete journey.
5. At most three screened parking candidates receive full driving and foot directions, two candidates
   concurrently. Actual pedestrian duration must satisfy the requested walk limit. A candidate with
   either invalid route is omitted. Both full geometry and metrics come from the actual provider.
6. Direct active walking and cycling are isolated with `Promise.allSettled`. A failed category does not
   erase valid alternatives. Without ORS, no complete car option is claimed because its foot leg is
   unavailable; standalone parking discovery and the existing driving demo remain accessible.

A cold full comparison is bounded to two matrices + six candidate directions + two active directions.
Cache hits can reduce that number. This is a bounded shortlist, not a citywide optimum.

## Ranking policy

Backend `engines/completeRanking.ts` returns all preference rankings in one calculation:

| Preference | Policy |
|---|---|
| Fastest | Lowest calculated sum of travel-leg seconds; deterministic ID tie-break |
| Balanced | Fastest practical active journey if within 300 seconds of fastest; otherwise fastest |
| Green | Fastest practical active journey; otherwise fastest available |

Walking practicality is ≤35 min; cycling ≤45 min. These are prototype design thresholds, not research
findings, emissions estimates, accessibility or safety guarantees. Parking preference controls the
shortlist separately. Missing and mixed-currency costs are not optimized as zero by journey ranking.
There is no claim of a financially optimal or equivalent complete elapsed-time comparison.

Opportunity requires an actual complete car comparison and a practical active option adding no more
than 15 minutes. It uses the travel-leg difference and repeats the excluded parking-search limitation.

## Costs and uncertainty

Car `travelSeconds` sums drive+walk. `elapsedSeconds` is null because parking search and maneuvering
are unknown. We do not add a fabricated zero. Fuel and total monetary cost remain unknown.

Reuse of the published Timpark schedule/stay/hourly/progressive/day-ticket model does not establish a
universal final payment. The source's `eur` field is kept as EUR. New complete-journey parking fees are
labelled **orientative/estimated**, include the chosen time/stay/source and tell users to verify the final
amount for their payment method in Timpark/CityApp. No implicit RON conversion. OSM fee=no remains an
explicit estimated source, not a live confirmation. Occupancy is always unknown in this contract; the
uncalibrated SmartMatch probability never becomes a displayed live probability here.

## Cache, limits and privacy

Completed comparisons: bounded 100 entries, 60 s success / 15 s partial backoff, exact coordinates,
all constraints and tariff-time minute bucket in the key. Concurrent identical requests coalesce;
preference is excluded because all rankings are returned. At most 12 distinct comparisons can be
pending. Directions: existing bounded driving cache, active cache 100 entries/5 min with in-flight
coalescing. Driving/foot matrices now also coalesce and back off briefly after failure. HTTP provider
timeouts remain 8–15 s; browser complete request deadline is 45 s. No endless retries.

Origin/destination/route data live in short-lived backend process caches and browser memory, not City
analytics. The service worker excludes APIs. The navigation handoff includes the selected origin and
parking coordinate in the navigation URL, so normal browser history can contain those point coordinates.
Motion's separate GPS/reward privacy rules are unchanged. No raw GPS traces are sent to FLOW City.

## Integrated UI and map

Existing Green Switch now consumes complete journeys. Preference changes select backend-returned IDs
without another HTTP request. An abort controller, request identity and cleanup guard prevent stale
responses after rapid origin/destination/constraint changes. Errors, no origin, no results and per-mode
unavailability have readable states.

Cards show mode, route-leg time, parking/distance and an accessible selected state. The summary and
interactive drive → park → walk timeline use the same selected journey. Stable MapLibre GeoJSON features
preserve each provider line: blue driving, green cycling, dashed pedestrian geometry. Parking is a marker,
not a fabricated movement line. Leg selection changes emphasis/camera. Resize/sheet observation refits the
route around the actual panels without replacing the map. Theme reload restores these layers.

Self-hosted Inter/Manrope Latin and Latin Extended variable fonts use `font-display: swap`; Romanian
characters are present, with system fallbacks. Four WOFF2 subsets total about 173 kB in the measured build.
Motion uses short opacity/transform reveals, tactile selection and interruptible camera movement; reduced
motion removes decorative transitions and camera animation. Nothing essential depends on animation/audio.

Active handoff opens existing Motion in the intended mode, with a plan banner. Manual mode changes clear
an incompatible plan. An activity already in progress is preserved rather than replaced by a new plan.
Only actual completed activity evaluation can affect the real prototype wallet; selection remains zero.
Car navigation targets the chosen parking and retains the explicitly chosen preview origin. The final
walk remains inspectable in the planner; automatic GPS car-to-foot navigation is not implemented here.

## Configuration, verification and limits

`ORS_API_KEY` belongs in backend secure environment configuration. Never use `VITE_` for it. Restart after
binding it. ORS HTTPS egress and map style/tile access must be allowed. Local tests use no external key.

```bash
pnpm typecheck
pnpm test
pnpm build
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright node scripts/test-smart-journey-browser.cjs
```

Browser fixture screenshots are visibly stamped synthetic; the initial provider-unavailable path uses
the real running backend. Fixtures prove interaction/contracts, not external connectivity or road safety.
Actual ORS key is absent here; official-site/OSRM HTTPS attempts received proxy CONNECT 403 on 14 Nov.
**REAL PROVIDER VERIFICATION BLOCKED.** No complete live ORS journey was verified in this environment.

Not implemented: verified cycling-infrastructure overlay, full scheduled transit planner/GTFS connections,
live occupancy/traffic, calibrated availability, exact emissions savings, automatic navigation phase transfer
or new optional sponsor integrations. These remain separate from the working routed-journey orchestration.
