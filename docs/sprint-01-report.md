# Sprint 01 engineering report · 14 November 2026

## Repository and delivery

Started clean at `9d35ac2` on `feature/premium-green-mobility`. Fetched the actual remote and
fast-forwarded to teammate fix `f476e37112862318fb37ad06f977491a7837b4fa` before creating
`feature/flow-smart-journey`. No uncommitted teammate work was replaced. Delivery uses logical
backend, frontend and handover commits on that branch; exact pushed SHA is reported after remote
verification in the delivery response. No automatic main merge, force push or production deployment.

The team's supplied freeze is 15 Nov 2026, 13:00 Europe/Bucharest (11:00 UTC). A clock check at
14 Nov 01:29:54 UTC left about 33½ hours. Official-site access was blocked, so this deadline is
recorded as team-supplied, not freshly independently verified.

## WORKING

- Shared `CompleteJourneyRequest`, `CompleteJourneyResponse`, `CompleteJourney`, `JourneyLeg`, sourced
  meters/seconds/monetary metrics and strict `ActiveJourneyContext`; finite geometry/metrics, coherent
  leg ordering, continuity, totals and ranking references. Unknown overhead/price are not numeric zero.
- New `POST /api/journeys/complete`, reused SmartMatch service and existing drive/active providers.
  Independent partial modes; bounded shortlist/full directions, caches, in-flight coalescing, timeouts,
  access and walking-limit checks. Actual geometry required for both car and final walking legs.
- Backend deterministic fastest/balanced/green rankings; balanced uses the tested five-minute active
  threshold. Practical limits remain 35 min walking / 45 min cycling. No invented cost/CO₂ optimization.
- Green Switch consumes the unified response; preference changes spend no new provider call. Explicit
  origin, complete cards, summary, orientative parking details, source panel and interactive timeline.
- Stable MapLibre drive/cycle/foot features, dashed walking line, parking marker, leg emphasis, camera
  fit around actual sheet/sidebar, responsive resize and theme source restoration. No route morphing,
  guessed polyline, new map engine or map recreation on preference/theme changes.
- Self-hosted Inter + Manrope Latin/Latin Extended fonts, Romanian diacritics, variable weights and
  tabular metrics. OFL notices shipped. Semantic theme accents, selected indicators, short transform/
  opacity reveals, accessible pressed states, status/error announcements and reduced motion.
- Motion receives validated planned mode/context without requesting recording GPS or awarding coins.
  Manual incompatible mode changes clear the plan; a new handoff reapplies its intended mode. An
  existing recording is preserved. Existing server reward checks and idempotent wallet remain intact.
- Car navigation receives the actual chosen parking and explicit preview origin. Final foot geometry
  remains available in the planner; no automatic car-to-foot navigation transition is claimed.
- Existing Explore parking details, four primary tabs, GPS denial/manual choice, Navigation, wallet,
  challenges, community preview, City/Data views and PWA shell remain exercised by regression scripts.

## Actual verification

| Check | Observed result |
|---|---|
| `pnpm typecheck` | Passed all workspaces |
| `pnpm test` | **134 passed**: 69 shared, 46 backend, 19 frontend |
| `pnpm build` | Passed; public PWA manifest generated |
| Complete endpoint HTTP integration | Real Express router with synthetic providers; strict validation, ordered legs and simultaneous-request coalescing passed |
| `test-smart-journey-browser.cjs` | Passed actual missing-provider path, synthetic complete alternatives, interactive timeline/map, no repeat preference calls, stale responses, mode handoff/re-entry, zero selection reward, explicit car preview origin, both themes and 360/390/430/768/1440 widths |
| `test-premium-browser.cjs` | Passed integrated shell, actual local municipal search/fallback map, five widths, theme persistence, activity preservation, wallet, City/Data and 404 |
| `test-navigation-browser.cjs` | Passed synthetic alternatives, denied GPS, DEMO pause/restart/arrival, real MapLibre pitch/bearing/2D/recenter, mocked GPS/reroute/cooldown/cleanup |
| `test-motion-browser.cjs` | Passed short GPS/permission/sensor/reward-tampering/demo-isolation/layout checks; no new physical walk or 100-second real-clock run claimed in this sprint |
| `test-site-browser.cjs` | Passed WebGL failure recovery and independent navigation loading |
| `test-pwa-browser.cjs` | Passed public-only cache, API/auth exclusion, cookie omission, offline deep links and safe waiting updates |
| `test-production-browser.cjs` | Passed actual compiled missing-provider path, synthetic compiled Smart Journey→Motion handoff, deep links and offline Motion DEMO; **27 public cached entries, zero API entries**; no uncaught exceptions |

The navigation browser test initially hit a restart/virtual-clock timing failure. Allowing React's
restart effect to commit before clock advancement made its deterministic arrival check pass; the
navigation implementation was not changed to satisfy the test.

Observed build sizes: root JS about 284.4 kB minified / 72.5 kB gzip; four local font subsets about
173.3 kB; MapLibre remains about 801.7 kB minified / 217.6 kB gzip and triggers Vite's existing >500 kB
chunk warning. These are build observations, not Lighthouse, FPS, 4G latency or physical-phone scores.
Cold routing is capped at 2 matrices + 6 shortlisted-parking directions + 2 direct active directions;
cache hits reduce calls. Browser preference/leg switches used the already-returned result.

Screenshots: workspace `/workspace/artifacts/smart-journey/` contains empty/destination/loading,
actual provider-unavailable, complete car/parking/foot, active alternatives, opportunity, timeline,
Motion handoff, both themes and five widths. Synthetic routes are visibly stamped. A representative
subset is checked into `docs/screenshots/smart-journey/` for review. Actual municipal map fallback is
labelled partial. No emulated viewport is described as a physical device test.

## PARTIAL / BLOCKED

**REAL PROVIDER VERIFICATION BLOCKED.** Backend configuration check returned `ORS_API_KEY: false`.
Independent HTTPS attempts to UniHack, the municipal guide and OSRM received proxy CONNECT 403
(HTTP tunnel not established). No complete live provider journey, traffic estimate, bike route safety
or successful public deployment is asserted. The code uses the appropriate ORS foot/cycle profiles,
but fixture success is not proof that an external account/quota/network is available.

Real geographic sources: existing municipal Timpark geometry/tariffs (13 Nov snapshot,
version d014276a755c), street/landmark datasets, OSM parking/geography with attribution and the existing
Natural Earth generalized Timiș county boundary. No new cycling infrastructure or GTFS data was invented.
Parking fees are orientative, preserve EUR from source, carry time/stay context and defer final payment
to Timpark/CityApp. Live occupancy and full elapsed parking time remain unknown.

Gate status: core orchestration, contracts, truthful results, UI/map/handoff, reward isolation,
automated checks and repeatable runbook are WORKING under validated fixtures/local data. Actual
live-route acceptance and physical phone/resident validation are PARTIAL/BLOCKED as described.
The code license was later set to MIT (`LICENSE`, 14 Nov 2026).

## NOT IMPLEMENTED

Verified cycling-infrastructure overlay, full GTFS transit connections, live occupancy/traffic,
calibrated parking probabilities, measured avoided emissions, automatic car-to-foot GPS transfer,
new Auth0/Tiger Data/Solana/ElevenLabs/Vision integrations, fabricated users or published testimonials.
No DEV article/outreach or sponsor submission was published. These were outside this sprint's scope.

## Handover and next sprint

Main changed areas: shared complete-journey schemas and fixture-only tests; backend recommendation
extraction, orchestrator/ranking, active and matrix caches, routes/tests; frontend Green Switch/hook/
timeline/map layers, Motion intent handoff, navigation origin, fonts/themes; browser scripts and docs.
See the actual Git diff for the complete file list.

- Architecture/API/configuration/uncertainty: [complete journeys](complete-journeys.md).
- NetRom architecture/evidence: [Glue It Together](challenge-evidence/netrom-glue-it-together.md).
- Jury sequence and honest fallback: [demo](demo-smart-journey.md).
- Real volunteer consent/tasks/metrics/iteration: [Living Labs protocol](user-testing/flow-smart-journey.md).

Next priorities: bind ORS securely and enable approved HTTPS egress, verify one complete actual trip and
provider quotas, test two physical phones, run actual volunteer rounds and document fixes/retests. Then
add a verified attributed cycling-infrastructure snapshot. Full transit requires valid SMTT GTFS
calendars/trips/transfers; separate optional sponsor integrations should follow core acceptance.
