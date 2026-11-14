# School Shield hardening — Mission 04

Engineering review: 14 November 2026. Status: isolated hardening implemented; future routing integration remains required. No municipal approval or production deployment is claimed.

## Isolation and immutable references

- Source: `origin/school-drop-off-zones`, **af2c8bbaffaab454b365b7387bdd82c28b3b56d1**.
- Working/delivery branch: `feature/school-shield-hardening`, created directly from that SHA. It did not exist locally or remotely at the initial inspection.
- Audited main/common ancestor: **f8ae4747ed36fcbfdce98d7228aeedfac66eaeb6**.
- Audited HeiGIT handoff: `origin/feature/unihack-final-integration`, **f142c73255031771787799dc309d8e9e0a195bdc**.
- Also inspected: `feature/ors-heigit-integration` at **1ddc438762c5f139a1c33d798e3b07952326cfab** and `feature/bega-green-spine` at **6c929e36b7df927140c7644b16e02b2e5c7a812a**. `feature/stpt-bio-pacer` was absent at inspection; absence does not imply no active worker.
- Initial workspace branch `work` was clean and left at its existing commit. No merge, rebase, reset, cherry-pick, force-push, deployment or PR merge was performed.
- Remote fetch configuration originally fetched only main; explicit read-only fetches obtained the named source/integration references.

The original School Shield history contains unrelated inherited parked-car, tour and offline-demo additions. They are **not** Mission 04 changes and have not been replayed or edited. Review the new patch against the immutable School Shield SHA above, not main.

## Existing architecture and preserved contracts

`cityData.ts` loads the OSM snapshot and makes named institutions searchable. `recommendParkings()` builds real-data candidates, calls `schoolZone()`, and applies `applySchoolZone()` **before** the walking/driving matrices and candidate cap. Ranking remains unchanged. The response includes `protectedZone` with active, optedOut, applied, schools, window, insideZone and excluded fields.

`schoolZone()` combines `schoolsNear()`, backend `slotOf()` and `schoolWindowAt()`. `slotOf()` explicitly uses `Intl.DateTimeFormat` with **Europe/Bucharest** and the existing Romanian public-holiday helper. No implicit host-timezone conversion was added.

`ParkingRecommendations` renders `SchoolZoneCard` and preserves its `{ zone, onToggle(on: boolean) }` contract. `App` derives `zoneCircles()` only when applied. MapView draws circles; ParkingDetail and simulated navigation request avoidance circles through the existing API. The existing Decidem interaction produces a local draft only.

No exported function name, schema shape, dependency, global design token, parent callback or provider implementation changed.

## Source provenance and observed data quality

`shared/src/data/schools.osm.json` contains **129 OSM records: 72 schools and 57 kindergartens**, retrieved **2026-11-14T14:14:46.124Z** (16:14:46 Europe/Bucharest). Source: OpenStreetMap via Overpass, `amenity=school|kindergarten`, bounding box `45.7,21.15,45.81,21.31`; attribution: © OpenStreetMap contributors (ODbL).

This is a version-controlled geographic snapshot, not an independently surveyed school register. It has a retrieval timestamp, but no separate `data.version` field. Eleven records lack names. No repeated IDs or exact repeated coordinates were present in this snapshot. Some names repeat (Wendy School, Școala Gimnazială Dumbrăvița, Liceul Teoretic Grigore Moisil); names alone cannot establish whether separate OSM objects represent duplicates, separate buildings or separate campuses.

OSM way/relation centres are not verified entrances. Operational status, relocation, entry accessibility and stopping legality have not been independently verified. The snapshot and fetch pipeline were left untouched. Unnamed/blank names receive an explicit OSM fallback label; data is never invented.

## Exact geographic policy and changes

- Destination trigger: **distance ≤ 150 m**, inclusive, using existing `distanceM()` in `[longitude, latitude]` order.
- Analysis: **250 m** circle per selected institution, up to **four** institutions.
- Candidate exclusion: strict interior of the **union** of circles, distance **< 250 m**. A point exactly on the radius is retained. A **0.000001 m** numerical tolerance absorbs floating-point noise at these boundaries; this is not measurement accuracy or a new product radius.
- Ordering: distance, then locale-independent OSM ID ordering, then coordinate/name/kind tie-breakers for conflicting records with the same ID.
- Correction: repeated IDs are removed before the four-school limit; the nearest valid occurrence wins. Distinct IDs sharing a coordinate remain separate because there is no reliable evidence they are the same institution.
- Correction: invalid/nonfinite/out-of-range school and destination coordinates and malformed/nonpositive OSM IDs cannot trigger a zone. The protected `OsmSchool` snapshot schema accepts general numbers, so the guard belongs at selection without changing that contract.
- Correction: circle generation rejects invalid coordinates, nonpositive/nonfinite radius, invalid step count, degenerate quantized rings and out-of-range generated vertices. Valid local-city circle generation is unchanged. It is not a global/polar/dateline geodesic polygon generator.

Distances retain the existing local equirectangular approximation (Earth radius 6,371,000 m). Circle vertices retain the existing latitude/longitude adjustment, six-decimal rounding and default 32 steps (routing uses 24; map uses 48). The inscribed polygon approximates the mathematical circle; it is not exact traffic-restriction geometry. No stable geometry algorithm was rewritten.

`metresInside()` remains a midpoint estimate on provider geometry densified at approximately 10 m, rounded to metres. Overlap uses `some()` and is counted once; reversed/split test routes and degenerate zero-length routes are covered. It cannot prove continuous avoidance, legal access or road safety. Provider route geometry is validated elsewhere; the helper is not a substitute for that validation.

## Time policy, holidays and opt-out

Configured windows are **07:30–08:30**, **12:00–14:00**, **16:00–17:30**, Monday–Friday, Europe/Bucharest. Starts are inclusive; ends are exclusive. Existing holidays suppress activation: fixed dates plus Orthodox Good Friday, Easter and Pentecost calculations. The underlying movable-holiday helper documents validity for 1900–2099; an input year of 2100 needs a later shared-calendar review.

School vacations, institution-specific teaching days and exceptional closures are **not modeled**. A configured July weekday can therefore activate the rule; UI and tests disclose this instead of calling it a verified school day. The holiday list is an existing prototype implementation, not a live authoritative legal-calendar service.

`mode='off'` preserves temporal `active` but sets `optedOut=true`, `applied=false`. Returning to `auto` reapplies filtering during an active window. The card now permits opt-out even while inactive, correctly prioritizes the opted-out label and requests no medical or personal explanation. No opt-out persistence behavior was added; the parent settings remain authoritative.

Equivalent explicit UTC offsets, winter/summer offsets, both 2026 DST transitions, exact window boundaries, Friday/weekend and fixed/movable public holidays are tested. Invalid API arrival strings are excluded by the existing request schema; a direct invalid Date continues to throw RangeError rather than silently using now.

## Parking-filter behavior and empty results

`applySchoolZone()` retains input order and does not mutate candidates or the input zone. It counts each input candidate once even when several circles contain it. `insideZone` is the pre-ranking candidate count; `excluded` is that count only when applied, otherwise zero. These are neither parking-space counts nor occupancy measurements nor a complete inventory of the neighbourhood. Duplicate candidate rows are the upstream candidate builder's responsibility; this patch does not merge distinct candidate records or invent facilities.

When all candidates are inside, the result remains an empty list. Empty inputs remain empty. Nothing is restored automatically and no curbside stopping point or Kiss & Walk facility is invented. The card no longer directs users to presumed parking below it: it explains that an alternative is not guaranteed and offers search adjustment or opt-out. The current props do not expose the number of retained or finally walk-eligible candidates, so a precise “no suitable alternatives” state needs parent/service integration (see blockers).

## Road safety, routing and legal integrity

The zone is an **estimated product recommendation**, not a legally closed road, verified entrance, safety system or official municipal zone. Parking data does not certify stopping legality, vacancy or pedestrian accessibility. No wheelchair, crossing-safety or blind-navigation guarantee is made.

Read-only routing observations:

1. `routing.ts` currently posts 24-step circles as ORS `avoid_polygons` MultiPolygon to the old `api.openrouteservice.org` host. The HeiGIT branch uses `https://api.heigit.org/openrouteservice/v2/` and endpoint checks; both changes must survive integration.
2. Circles containing the origin or destination are dropped by `usableAvoid()`. Partial/all dropping is not exposed in the response; requested avoidance and applied avoidance can differ.
3. An HTTP refusal with avoidance retries an ordinary route and reports `failed`. Network errors go to the existing saved-demo fallback (if exact matching data exists), reported `not_supported` when avoidance remains. Keyless OSRM cannot apply avoidance.
4. Overlapping circle polygons are submitted separately. Some providers may reject overlapping MultiPolygon components. Local union-count tests do not verify provider polygon acceptance.
5. Cache keys include rounded endpoints and effective circles; success cache is five minutes and saved fallback is fifteen seconds. Approximate keys and dropped circles must not cause misleading provenance after integration.
6. ParkingDetail measures provider geometry, but its `ZoneRouteNote` suppresses failure/unsupported explanation when the sampled overlap is zero. The School Zone Card has no route-result prop and does not claim route avoidance.
7. `completeJourneys.ts:carJourneys()` forwards the school mode into parking screening but calls `deps.drive(req.origin, p.coordinate)` without the returned school's avoidance circles. School Shield parking filtering therefore does not imply driving-leg avoidance in complete journeys.

All these routing and application consumers remain unchanged in this branch. No live avoidance request was used to certify these behaviors during Mission 04; existing provider-adapter tests use mocks.

## Civic proposal changes

`schoolStreetProposal()` remains deterministic and local. It uses the selected school names, configured hours, actual candidate/exclusion counts, radius and OSM link. Street names are explicitly geographic hints, not certified school access. The draft asks competent authorities to **evaluate** hypothetical measures, retain inclusive access and verify the school calendar, local access and legality. It no longer asserts that cars can stop at an arbitrary 250–300 m point or that 3–4 minutes of walking is verified. It invents no signatures, resident support, measured impacts or official approvals.

Singular/plural counts now read “1 parcare candidată”, “2 parcări candidate”, “20 de parcări”, and report zero exclusions honestly after opt-out/inactivity. Counts cover all selected circles, not just the first institution. OpenStreetMap object URLs accept positive node/way/relation IDs only.

Clipboard success, pending and failure states have text feedback. Clipboard denial retains a selectable read-only draft for manual copying. Copy status resets when the draft changes. Only the user may choose to visit Decidem, edit and submit the draft; no automatic submission, authentication or new external provider was introduced.

## UI and accessibility assessment

Only `SchoolZoneCard.tsx` and its imported `schoolShield.css` changed visually. All new stylesheet selectors are rooted in `.school-shield`; no global overrides or token changes were made. Existing typography, light/dark theme tokens and `QualityBadge` are retained. The obsolete inherited `.school-zone` styles remain untouched in protected `parking.css`.

The card presents School Shield, wrapping school name/approximate OSM distance, explicit textual state, estimate badge, analysis radius, exclusions and current/configured windows. Sources and a hypothetical Decidem draft use native details/summary. Legal/source/calendar limits remain visible or available through a labelled disclosure. Additional institutions have OSM links when available. Real-parent screenshot review caught inherited `.explore-panel details > summary` styling that reduced disclosure text to 11 px and targets to 38 px. More specific School Shield-only selectors retain text-relative sizing, native disclosure markers and a 44 px minimum without changing the protected parent stylesheet.

WCAG 2.1 AA-targeted work: semantic section/heading and definition list, unique useId labels across multiple cards, native keyboard controls, aria-pressed toggle state, textual live statuses, decorative SVGs hidden from assistive technology, visible focus, 44 px minimum action targets, wrapping controls/names, text-relative sizes and reduced-motion handling. No medical disclosure, keyboard trap, color-only state or decorative looping animation was introduced.

This is component-level assessment, **not a WCAG conformance certification** or assistive-technology user study. Computed representative text/background contrast passed 4.5:1 in both themes (lowest checked: estimate badge 4.68:1 light / 5.50:1 dark; muted text 5.27:1 light / 6.73:1 dark). No real mobile device or screen reader was used. Accessible UI does not certify the generated walking route.

## Verification evidence

Runtime: Node **24.22.1**, available pnpm **11.25.0**. The repository requests pnpm 12.18.0; installation used the environment's pnpm with `--frozen-lockfile` and a workspace-local store. No dependency/lockfile was changed.

- Focused tests: **12 shared geometry/snapshot**, **36 backend School Shield/avoidance**, **5 frontend server-rendered semantic** tests passed (**53 total**).
- `pnpm typecheck`: passed across shared/backend/frontend.
- `pnpm test`: **247 passed**, **35 files** (shared 87/12 files; backend 119/14; frontend 41/9).
- `pnpm build`: passed TypeScript, Vite and PWA preparation. Existing non-failing map-engine chunk warning remains (about 802 kB minified).
- `git diff --check`: passed before delivery.
- Existing routing mocks cover applied avoidance, refusal fallback, OSRM unsupported status, endpoint-containing circles and saved-demo behavior. These are deterministic regressions, not live routing verification.

Frontend Vitest coverage is server-rendered semantics using existing ReactDOM/Vitest dependencies; it does not claim DOM interaction coverage. Separate temporary Chromium/Playwright browser checks use the real source component and existing CSS, with explicitly **synthetic institution fixtures**: active/inactive/opt-out, keyboard Enter/Space callbacks, source disclosure, actual successful browser clipboard, simulated clipboard denial/manual selection, changed-draft status reset, both themes at 320/390/768 CSS px, expanded content, long names, 44 px controls, no horizontal overflow/clipping, 200% root font at 320 px, visible keyboard focus and reduced motion. No browser-testing dependency or infrastructure was added to the repository. Shared desktop CUA initialization and native accessibility input failed, so headless Chromium supplied repeatable browser verification.

A second Chromium check exercised the existing application and local backend: searched “Diaconovici Loga”, selected the nearby OSM park destination (106 m from the school point), observed weekend inactivity, changed arrival to Monday 16 November 2026 at 07:45 Bucharest, then toggled off and back on through the parent callback/API refresh. All four states rendered successfully. Follow-up checks in the real parent at 320/390/1280 CSS px verify card overflow, expanded disclosures, 44 px targets and 14 px disclosure text; 200% root text produces 28 px disclosure labels. This uses the real snapshot and backend estimates; it does not certify live routing.

The standalone browser harness and screenshots are intermediate workspace evidence, not deployed app assets. A physical phone, a screen reader, live traffic, a real legal parking audit and live HeiGIT avoidance were not verified.

## Risk assessment and required integration work

| Priority | Finding | Required integration point/dependencies | Regression evidence required |
| --- | --- | --- | --- |
| High | Complete-journey driving loses avoidance after parking filtering | `backend/src/services/completeJourneys.ts` carJourneys: pass applied `zoneCircles(screened.protectedZone)` into driving, preserve returned avoidance/provenance in the journey contract and consumer | Mock applied/refused/unsupported avoidance; real HeiGIT polygon request; opted-out/inactive have no polygons; alternatives still screened |
| High | HeiGIT validation and School Shield avoidance diverge in routing.ts | Reconcile provider URL, optional avoid parameter, endpoint validation, error diagnostics, cache/pending keys and saved-demo fallback in `backend/src/services/routing.ts`; preserve navigation route schema/API | Run both routing branches' suites, matrix tests, complete journeys, endpoint validation, mixed successful/failed provider paths and cache isolation |
| Medium | Avoidance failure can be hidden when overlap rounds to zero; endpoint-containing circles dropped silently | `frontend/src/features/parking/ParkingDetail.tsx:ZoneRouteNote`, `routing.ts:usableAvoid`, `frontend/src/features/navigation/useNavigation.ts` and `frontend/src/features/navigation/NavigationScreen.tsx` as applicable; additive shared response status if needed | Failed/unsupported/no-overlap, partial drop/all drop, <10 m crossing, simulated navigation and source visibility |
| Medium | Overlapping MultiPolygon acceptance is unverified | `routing.ts` polygon payload; validate on HeiGIT, only union geometry if provider requires it, without changing 250 m policy | Real request with overlapping circles; rejection remains visible and ordinary fallback never claims verified avoidance |
| Medium | Final empty alternatives cannot be diagnosed from card props | `parkingRecommendations.ts`, `ParkingRecommendations.tsx` and response contract: distinguish no initial data/all excluded/walking limit/provider unavailable, carry retained counts if needed | All candidates inside, initially empty, all outside but walk-ineligible, inactive/opt-out; no fabricated parking or automatic opt-out |
| Medium | Arrival uses now when omitted; datetime-local uses device timezone | `parkingRecommendations.ts` at construction, `frontend/src/features/parking/settings.ts`; agree arrival semantics while preserving explicit offsets and Bucharest evaluation | Trips crossing a window boundary; device outside Romania; DST; explicit offset equivalence |
| Medium | School centres/operation/duplicates not surveyed | Protected school-data pipeline and OSM source review; never infer a merge from matching names alone | Invalid coordinates/IDs at ingestion, separate campuses, node/way duplicates with evidence, provenance/date preservation |
| Low | Movable-holiday helper uses a 13-day offset valid only through 2099 | Shared calendar consumers and protected holidays helper; require a reviewed calendar decision | 2100 Easter/Pentecost and request-range regression; no invented vacation schedule |

## Future HeiGIT integration instructions

1. Start a separately authorized integration branch. Do not merge these branches automatically as part of Mission 04.
2. Review inherited School Shield changes and HeiGIT changes separately against the common ancestor below. Apply the isolated hardening patch relative to `af2c8bb...`; do not attribute its inherited history to Agent 4.
3. In the six overlapping files below, retain HeiGIT URLs, validation and diagnostics **and** School Shield's optional avoid parameter, polygon serialization, unsupported/failed status and cache segregation. Resolve saved-demo provenance explicitly. Preserve walking/driving matrix fallbacks and complete-journey behavior.
4. Reconcile School Shield response propagation, map display, opt-out, simulated navigation and complete journeys at the integration points above. Do not equate an accepted avoidance request with verified safety or legal road closure.
5. Run the 53 focused tests, both branches' routing/matrix/integrity/offline-demo suites, complete-journey tests, then `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check`. Check the normal/demo browser flows and a bounded real HeiGIT avoidance request with no credential disclosure. Verify source/quality/failure text.

### Exact overlapping inherited files

Computed from changes between the common ancestor `f8ae4747...` and each audited branch tip:

```text
README.md
backend/src/services/activeRouting.ts
backend/src/services/journeys.ts
backend/src/services/routing.test.ts
backend/src/services/routing.ts
docs/third-party.md
```

Other integration-sensitive consumers include `backend/src/services/{driving,walking,parkingRecommendations,completeJourneys,offlineRoutes}.ts`, `backend/src/routes/{navigation,recommendations}.ts`, `shared/src/schemas/{navigation,protectedZone,completeJourney,recommendation}.ts`, `frontend/src/app/App.tsx`, `frontend/src/features/{parking/ParkingDetail,parking/ParkingRecommendations,journey/GreenSwitch,map/MapView,navigation/NavigationScreen}.tsx`, `frontend/src/features/navigation/useNavigation.ts`, and `frontend/src/services/api.ts`. These are review dependencies, not additional Mission 04 edits or an assertion of textual conflicts.

### Original School Shield branch file list (inherited, not this patch)

```text
CLAUDE.md
README.md
backend/src/engines/smartmatch/index.ts
backend/src/engines/smartmatch/schoolZone.test.ts
backend/src/engines/smartmatch/schoolZone.ts
backend/src/engines/smartmatch/tour.test.ts
backend/src/engines/smartmatch/tour.ts
backend/src/routes/navigation.ts
backend/src/routes/recommendations.ts
backend/src/services/activeRouting.ts
backend/src/services/cityData.ts
backend/src/services/completeJourneys.ts
backend/src/services/journeys.ts
backend/src/services/offlineRoutes.test.ts
backend/src/services/offlineRoutes.ts
backend/src/services/parkingRecommendations.ts
backend/src/services/routing.test.ts
backend/src/services/routing.ts
docs/spec.md
docs/third-party.md
frontend/src/app/App.tsx
frontend/src/features/car/BestTime.tsx
frontend/src/features/car/LeaveBy.tsx
frontend/src/features/car/ParkedCarCard.tsx
frontend/src/features/car/calendar.ts
frontend/src/features/car/car.css
frontend/src/features/car/car.test.ts
frontend/src/features/car/carStore.ts
frontend/src/features/car/favourites.tsx
frontend/src/features/car/handoff.ts
frontend/src/features/journey/GreenSwitch.tsx
frontend/src/features/map/MapView.tsx
frontend/src/features/navigation/NavigationScreen.tsx
frontend/src/features/navigation/navigation.css
frontend/src/features/navigation/places.test.ts
frontend/src/features/navigation/places.ts
frontend/src/features/navigation/scenario.ts
frontend/src/features/navigation/useNavigation.ts
frontend/src/features/parking/ParkingDetail.tsx
frontend/src/features/parking/ParkingRecommendations.tsx
frontend/src/features/parking/SchoolZoneCard.tsx
frontend/src/features/parking/StopPicker.tsx
frontend/src/features/parking/parking.css
frontend/src/features/parking/settings.ts
frontend/src/features/search/DestinationSearch.tsx
frontend/src/features/trust/PrivacyScreen.tsx
frontend/src/services/api.ts
package.json
scripts/fetch-demo-routes.mjs
scripts/fetch-osm-schools.mjs
shared/src/data/README.md
shared/src/data/demo-routes.json
shared/src/data/schools.osm.json
shared/src/destinations.ts
shared/src/index.ts
shared/src/parkedCar.test.ts
shared/src/parkedCar.ts
shared/src/protectedZones.test.ts
shared/src/protectedZones.ts
shared/src/schemas/city.ts
shared/src/schemas/completeJourney.ts
shared/src/schemas/navigation.ts
shared/src/schemas/protectedZone.ts
shared/src/schemas/recommendation.ts
```

### HeiGIT integration branch file list

```text
README.md
backend/src/services/activeRouting.ts
backend/src/services/driving.test.ts
backend/src/services/driving.ts
backend/src/services/journeys.test.ts
backend/src/services/journeys.ts
backend/src/services/routeValidation.ts
backend/src/services/routing.test.ts
backend/src/services/routing.ts
backend/src/services/routingDiagnostics.ts
backend/src/services/routingIntegrity.test.ts
backend/src/services/walking.test.ts
backend/src/services/walking.ts
backend/tsconfig.json
docs/complete-journeys.md
docs/green-switch.md
docs/navigation.md
docs/ors-verification.md
docs/third-party.md
scripts/test-routing-reliability-browser.cjs
scripts/test-smart-journey-browser.cjs
scripts/verify-ors.ts
```

## Protected files and delivery audit

The new patch contains exactly these seven allowed files:

```text
backend/src/engines/smartmatch/schoolZone.test.ts
shared/src/protectedZones.ts
shared/src/protectedZones.test.ts
frontend/src/features/parking/SchoolZoneCard.tsx
frontend/src/features/parking/SchoolZoneCard.test.tsx
frontend/src/features/parking/schoolShield.css
docs/school-shield-hardening.md
```

In particular, routing, driving, walking, journey, complete-journey, recommendation services, API routes, App, MapView, navigation, parent parking components, parking.css, global styles/tokens, snapshots, schemas, exports, root manifests/lockfiles, Bega/Bio-Pacer modules and deployment/GitHub configuration were left unchanged relative to the School Shield base. The existing schoolZone engine implementation required no algorithm rewrite.

Delivery procedure: compare the exact file set and staged diff against the immutable base, require all code gates, commit `Harden School Shield rules and accessible UI`, push only `HEAD:refs/heads/feature/school-shield-hardening` without force, then compare `git ls-remote` with the local commit. The final commit URL and verified push result are reported in the engineering handoff; they cannot be embedded as this document's own commit SHA without changing that SHA.

Known remaining limitations are the integration issues above, missing full school calendars, OSM entrance uncertainty, unverified real-world parking/access/safety, no physical-device or screen-reader validation, and no new live routing verification. None was hidden by weakening a test or changing a protected file.
