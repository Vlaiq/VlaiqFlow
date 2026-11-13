# VLAIQ FLOW — Product & Technical Specification

> Cleaned-up version of the original master prompt (`readme.txt`). Agent rules live in `/CLAUDE.md`, and human-only tasks in `docs/team-checklist.md`.
> Items marked **[VERIFY]** are assumptions a team member must confirm. Items marked **[DECIDE]** need a team decision.

---

## 0. Open decisions & assumptions

| # | Item | Default until changed |
|---|---|---|
| D1 | Hackathon rules on pre-existing code and AI tools **[VERIFY]** | No app code is written before the official start |
| D2 | Transit operator & GTFS source **[VERIFY]** | Operator assumed to be **STPT** (Societatea de Transport Public Timișoara). The original doc said "SMTT", which is likely wrong |
| D3 | Routing / geocoding quotas **[VERIFY]** | openrouteservice free plan; check the current daily limits for directions, matrix and autocomplete |
| D4 | Emission factors **[VERIFY]** | `EMISSION_FACTOR_CAR_G_PER_KM` and `EMISSION_FACTOR_TRANSIT_G_PER_PKM` live in config with a cited source. No number is shipped without a source |
| D5 | UI language **[DECIDE]** | English UI, Romanian strings where cheap; assistant understands RO + EN |
| D6 | Final product name **[DECIDE]** | VLAIQ FLOW |
| D7 | Domain for backend HTTPS **[DECIDE]** | Cheap domain or `sslip.io` hostname pointing to the Vultr VM |

---

## 1. Context

- **Event:** UniHack 2026, Timișoara, Nov 13–15, ~48 h of development.
- **Team:** VLAIQ, 4 members.
- **Goal:** first place in **Green Mobility** (competition "The Bloom"), plus a few sponsor challenges that fit naturally (§11.2).
- Only use datasets and systems whose access is confirmed. The municipality may provide data during the event.

## 2. Problem & differentiator

Drivers reach the city center and then circle looking for parking. That wastes time and fuel, adds congestion and emissions, and leaves parking under-used.

**Differentiator: we optimize the whole journey, not just the road route.** For a destination like Piața Victoriei, we compare:
- a close parking that is likely full,
- a farther parking with a shorter *total* journey,
- a cheaper parking with a good transit link,
- a park-and-ride option that avoids driving through the center.

Then we explain the recommendation with real numbers.

We are not rebuilding a full navigation app. We are building a parking-first, multimodal decision tool with turn-by-turn guidance to the chosen parking.

**Target users:** drivers going into the center, visitors unfamiliar with Timișoara, budget-conscious commuters, people preferring greener options, users who need accessibility information, and (secondary) city authorities via aggregated analytics.

## 3. Product format

A **PWA** reachable on a public HTTPS URL and through a QR code. It is usable without installing or logging in.

Platform constraints to design around:
- **iOS install** is manual ("Share → Add to Home Screen"), so show a hint.
- **`coords.heading`** is often `null` (always on iOS when slow). Compute the bearing from consecutive positions instead.
- **Screen sleep:** use the Screen Wake Lock API during navigation where supported, and show a note where it is not.
- **No background navigation** is promised. Show a clear "prototype, not a certified navigation system" notice.
- **Speech recognition** is missing in Firefox and unreliable on iOS, especially in standalone PWA mode. Text input is always available.

## 4. Architecture

```text
 Phone / desktop browser (PWA, React + MapLibre)
   │  HTTPS (JSON)
   ▼
 Backend (Express on Vultr, Caddy TLS)  ──►  openrouteservice (directions, matrix, geocoding)
   │   ├─ SmartMatch engine (pure TS)    ──►  Gemini API (function calling)
   │   ├─ provider cache (in-memory LRU) ──►  ElevenLabs TTS
   │   └─ rate limiting, zod validation
   ▼
 Tiger Cloud Postgres (TimescaleDB + PostGIS)   ← optional for P0
```

Rationale:
- **One backend** proxies every keyed API. That keeps secrets off the client, allows caching, and protects the quotas.
- **SmartMatch is a pure function** (`candidates + preferences → ranked options`). It is easy to unit-test and to explain to judges.
- **For P0, parkings are a static GeoJSON file** in `shared/src/data`, built from OSM with a documented query. The database is added when occupancy history, reports and analytics arrive.
- **Fallback hosting:** if the Vultr setup blocks us, the backend can run as Vercel functions. We would lose the Vultr challenge but keep the demo.
- **Mixed-content trap:** the Vercel frontend is HTTPS, so the backend **must** be HTTPS as well (domain + Caddy). A bare IP over HTTP is blocked by browsers. CORS allows only the frontend origin(s).

## 5. Data strategy

### 5.1 Quality model (applies everywhere)

```ts
type DataQuality = 'confirmed' | 'estimated' | 'unknown' | 'simulated';
interface Sourced<T> { value: T | null; quality: DataQuality; source: string; updatedAt?: string; }
```

UI badge: text label plus color (§10). A listed parking ≠ a free space.

### 5.2 Sources

| Data | Source | Status |
|---|---|---|
| Parking locations, capacity (sometimes), fee tags | OpenStreetMap via Overpass (`amenity=parking` in the Timișoara bbox), exported to GeoJSON; ODbL attribution required | Real, but hand-check the demo-area parkings |
| Parking prices | Municipality / operator pages, data.primariatm.ro **[VERIFY]** | Real only where checked by a human; otherwise `unknown` |
| Live occupancy | None confirmed | `simulated` (demo) or `estimated` (community reports) |
| Transit stops / lines / schedules | STPT GTFS static, if published and licensed **[VERIFY]** | Real schedules. **Never** shown as live arrivals |
| Road / walking routes | openrouteservice | Real |
| Emissions | Configured factors with a cited source (D4) | `estimated` |
| Street (on-street zone) parking | Much of central parking is on-street zones, not facilities | P1: model zones as polygons if data exists; otherwise out of scope, and say so |

### 5.3 Simulation

- **Per session.** Demo occupancy is a seeded, deterministic dataset loaded by the client. Scenario events ("Parking A becomes full") are applied to the client's own state.
- **Analytics** uses a separate backend seeder that writes rows with `quality='simulated'`, plus any real reports. Charts label which is which.
- **Every simulated value** shows a "DEMO" badge.

## 6. Features & acceptance criteria

### 6.1 Explore (home)
Full-screen map centered on Timișoara with a floating search bar, locate-me button, parking markers, mic button, preferences, a "Try Demo" button and a small dismissible intro. There is no landing page.
- **Accept:** the map is interactive within 3 s on 4G; it works with GPS denied.

### 6.2 Location
- Ask for location only on user action (locate button or Live GPS mode).
- **If granted:** show a marker with an accuracy circle, a follow-mode toggle and a recenter button.
- **If denied:** pick the origin manually or use the demo origin.
- **Bad readings:** ignore fixes with `accuracy > 100 m` for navigation, and ignore jumps > 150 m within 2 s.

### 6.3 Destination search
- openrouteservice autocomplete through the backend, restricted to the Timișoara bbox, debounced to 300 ms, with results cached.
- Preset chips: Piața Victoriei, Piața Unirii, Iulius Town, Centru. These work even when geocoding is down.
- **Do not use Nominatim for autocomplete** (its usage policy forbids it).

### 6.4 Parking discovery
After a destination is set, show parkings within a radius (default 1.5 km walking).

Each parking shows: name, type, address?, capacity?, price (`Sourced`), availability (`Sourced`), walking distance and time, source, last update and quality badge.

### 6.5 Recommendation modes
**Fastest / Cheapest / Greenest** tabs, computed by SmartMatch (§7). The user can switch between them and compare the top option of each side by side.

### 6.6 Recommendation cards & details
**Card:**
- name, total time with a breakdown (drive / search / walk / transit)
- cost, availability badge, confidence
- driving-km delta vs. the nearest option
- a one-line explanation and a "Start" button

The best option is visually highlighted.

**Details panel:**
- everything on the card, plus verified price info, accessibility info (or "Unknown")
- walking route preview
- "Report" and "Navigate" buttons

### 6.7 Navigation (live GPS)
- Route line from the provider geometry, a vehicle marker with bearing, and a follow camera (pitch optional).
- Remaining distance, ETA, progress and the next maneuver (from the provider's instructions).
- **Off-route** = more than 50 m from the route for 3 consecutive fixes, which triggers a reroute (at most one per 20 s).
- `clearWatch` on stop or unmount.

### 6.8 Demo Simulation Mode (mandatory)
- Fixed demo origin in Timișoara and no GPS needed.
- Controls: start / pause / resume / reset / speed (1×, 2×, 4×).
- Marker interpolated along the geometry with `requestAnimationFrame`; bearing follows the road; ETA and distance update live.
- A permanent "SIMULATION" label.
- **Offline fallback:** the demo route geometry and its matrix results are bundled as JSON. The demo runs even if openrouteservice is down.

### 6.9 Smart rerouting (polished showcase)
1. A scenario event marks the selected parking as full (simulated).
2. SmartMatch re-ranks from the current position.
3. A banner says: "Parking A is now full. Parking B adds 2 min and is 85 % likely free. Switch?"
4. There is one large **Switch** button plus a voice prompt. The banner dismisses after 15 s and keeps the current route, so nothing changes without consent.
5. On accept, the new route is drawn with an animated transition.

All numbers in the banner come from SmartMatch output.

### 6.10 Driving → walking transition
- On arrival (within 30 m of the parking): show an "Arrived at Parking B" sheet.
- Then switch to a foot-walking route to the original destination, showing walking time and distance, with the destination still visible.
- For a transit option: walk to the stop, then the line, then walk to the destination (scheduled times only).

### 6.11 AI assistant (P2)
**Flow:**

```text
mic or text → SpeechRecognition → POST /api/assistant/command → Gemini with function declarations → validated call → SmartMatch / app action → response text → TTS
```

**Whitelisted functions:**
- `searchDestination(query)`
- `findParking(destinationId?)`
- `setRoutePreference(mode)`
- `setMaxWalkingMinutes(n: 1–30)`
- `setParkingBudget(ron: 0–100)`
- `setTransitPreference(avoid|prefer|neutral)`
- `requireAccessibleParking(bool)`
- `explainRecommendation(optionId)`
- `selectParking(id)`
- `startNavigation()`, `stopNavigation()`, `switchToWalking()`
- `getParkingDetails(id)`

**Rules:**
- Arguments are validated with zod. On invalid input, ask a clarifying question.
- The response text is generated from SmartMatch's structured output. Gemini may phrase it but must not add numbers.

**UX:**
- listening, transcript, processing, response, mute, cancel and error states
- the mic is active only after a tap
- while driving, show only a one-line answer and spoken output

**Fallback:** if Gemini fails, a small keyword parser handles the 5 most common commands, and text input always remains.

### 6.12 Voice output (P2, ElevenLabs)
- TTS through the backend (`POST /api/assistant/speech`).
- Cache audio by text hash, cap characters per session (quota protection) and fall back to `speechSynthesis`.
- Never play prerecorded audio as if it were dynamic.

### 6.13 Community reports (P2)
- **Report types:** spaces available / full / wrong info / closed / confirm an existing report.
- **No login** is needed for anonymous reports: use an anonymous device UUID plus an IP rate limit (1 report per parking per 10 min).
- Auth0 users are "trusted" and get a higher weight.
- **Aggregation:**
  - a report decays linearly to zero over 30 min;
  - status becomes "reported full" only when ≥2 independent reports agree (or 1 trusted report);
  - always shown as `estimated`.

### 6.14 Analytics dashboard (P2, Tiger Data)
- **Route:** `/analytics`.
- **Charts:**
  - occupancy over time per parking (`time_bucket`)
  - peak hours (continuous aggregate)
  - reports count
  - data freshness
  - recommendation-mode mix (anonymous counts, no locations)
- Each chart labels simulated vs. real rows.

### 6.15 Accessibility
- Semantic controls, keyboard navigation and visible focus.
- ARIA labels on map controls and touch targets of at least 44 px.
- `prefers-reduced-motion` respected and WCAG AA contrast.
- **Accessibility filter** = parkings with OSM `capacity:disabled` > 0 or verified data; otherwise "Unknown".
- Never claim the product safely guides blind users. Never invent accessible routes. (openrouteservice's `wheelchair` profile is P3 and labeled `estimated`.)

## 7. SmartMatch algorithm

### 7.1 Candidates
Parkings within the walking radius, plus up to 2 park-and-ride parkings next to a transit stop with a line to within 500 m of the destination (P1).

### 7.2 Hard filters
Apply first, from the user's preferences:
- `walk_min ≤ maxWalk`
- `cost ≤ budget` (an unknown cost passes but is flagged)
- accessible parking required
- avoid or prefer transit
- `availability = 'full' (confirmed)` → excluded

### 7.3 Per-candidate values
- **Durations:**
  - `drive_min`, `drive_km`: matrix origin → parkings (1 matrix call).
  - `walk_min`: matrix parkings → destination (foot profile, 1 call).
  - `transit_wait_min`, `transit_min`, `transfers`: from GTFS schedules (P1); `transfer_penalty` = 5 min each.
- **Search time:** `search_min` = **demo assumption**, labeled in the UI:
  - occupancy < 85 % → 1 min
  - 85–95 % → 3 min
  - > 95 % → 6 min
  - unknown → 3 min (`quality='estimated'`)
- **Total time:** `total_min = drive_min + search_min + walk_min + transit_wait_min + transit_min + transfers × 5`. Each segment is counted once.
- **Cost:** `cost_ron` = price × stay duration (default 2 h, user-adjustable); `null` if unknown.
- **Emissions:** `co2_g = drive_km × EF_car (+ transit_km × EF_transit)`, quality `estimated` (D4).
- **Availability probability `p_free`:**
  - confirmed → `free / capacity` mapped to 0.05–0.98;
  - simulated → same formula on demo data;
  - unknown → 0.5, plus `confidence='low'`.

### 7.4 Scoring
1. Normalize each criterion with min–max over the remaining candidates to `n ∈ [0,1]` (0 = best).
2. If all candidates are equal, `n = 0`.
3. **Unknown values** get `n = 1` (worst) and add a flag that appears in the explanation ("price unknown"). They are never silently neutral.
4. Compute `score = Σ wᵢ·nᵢ`. The lowest score wins.

| Mode | total time | cost | CO₂ / drive km | walk time | availability risk (1 − p_free) |
|---|---|---|---|---|---|
| Fastest | 0.55 | 0.05 | 0.05 | 0.10 | 0.25 |
| Cheapest | 0.15 | 0.55 | 0.05 | 0.05 | 0.20 |
| Greenest | 0.15 | 0.05 | 0.55 | 0.05 | 0.20 |

Weights are constants in `engines/smartmatch/weights.ts` and shown in a "How we rank" sheet.

### 7.5 Explanations
Explanations are templates filled from the computed deltas vs. the runner-up. For example: "Parking B is recommended: 3 min faster in total than Parking A (drive 9 + walk 4 vs. drive 7 + search 6 + walk 3)." They include the comparison table.

### 7.6 Arrival-time prediction (P3)
Only with real historical data. Otherwise the feature is not shown.

### 7.7 Tests
Unit tests (Vitest) cover:
- filters
- normalization when all values are equal
- unknown handling
- each mode picking the expected winner on a fixed fixture
- rerouting picking the next-best option when the winner becomes full

## 8. Database (P1/P2)

The time column is part of the hypertable's primary key, because TimescaleDB requires it in every unique index.

```sql
CREATE EXTENSION IF NOT EXISTS postgis;      -- [VERIFY] available on chosen Tiger Cloud plan
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TYPE data_quality AS ENUM ('confirmed','estimated','unknown','simulated');

CREATE TABLE parkings (
  id            text PRIMARY KEY,               -- e.g. 'osm-way-123456'
  name          text NOT NULL,
  location      geography(Point,4326) NOT NULL,
  address       text,
  parking_type  text NOT NULL,                  -- surface | multi-storey | underground | street_zone | park_and_ride
  capacity      int,
  capacity_disabled int,
  price         jsonb,      -- {perHourRon, schedule, freeMinutes, source, verifiedAt} or NULL
  accessibility jsonb,
  source        text NOT NULL,
  source_checked_at timestamptz
);
CREATE INDEX ON parkings USING gist (location);

CREATE TABLE parking_updates (
  parking_id   text NOT NULL REFERENCES parkings(id),
  recorded_at  timestamptz NOT NULL,
  free_spaces  int,                 -- occupancy derived from capacity; no duplicate column
  quality      data_quality NOT NULL,
  confidence   real CHECK (confidence BETWEEN 0 AND 1),
  source       text NOT NULL,
  PRIMARY KEY (parking_id, recorded_at)
);
SELECT create_hypertable('parking_updates', 'recorded_at');
-- continuous aggregate: hourly avg free_spaces per parking, for the analytics charts

CREATE TABLE user_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parking_id   text NOT NULL REFERENCES parkings(id),
  user_id      text,                -- Auth0 sub, NULL for anonymous
  device_id    uuid NOT NULL,       -- random, anonymous, for rate limiting
  report_type  text NOT NULL,       -- available | full | wrong_info | closed | confirm
  confirms_report_id uuid REFERENCES user_reports(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);

CREATE TABLE transit_stops (
  id text PRIMARY KEY, name text NOT NULL,
  location geography(Point,4326) NOT NULL, gtfs_stop_id text NOT NULL
);
-- GTFS routes / trips / stop_times are preprocessed into a compact JSON
-- (stop → lines → scheduled departures) and kept in backend memory.

CREATE TABLE recommendation_events (   -- anonymous analytics; NO origin/destination coordinates
  recorded_at timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL, chosen_parking_id text, rank_of_chosen int, is_demo boolean NOT NULL
);
```

The original `route_requests` / `route_options` tables were dropped because they stored users' locations. Routes are computed on the fly and cached in memory.

## 9. API

All bodies are validated with zod schemas from `shared/src/schemas`. Errors use the shape `{ error: { code, message } }`, with codes `INVALID_INPUT | PROVIDER_TIMEOUT | RATE_LIMITED | UNAVAILABLE | NOT_CONFIGURED`.

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Status of each dependency (routing, gemini, tts, db) |
| `GET /api/geocode/autocomplete?q=` | Proxied, bbox-limited, cached |
| `GET /api/parkings?near=lat,lng&radius=` | Parkings with current `Sourced` availability |
| `GET /api/parkings/:id` | Details |
| `POST /api/recommendations` | `{origin, destination, preferences, demoOverrides?}` → ranked options for all 3 modes + explanations |
| `POST /api/routes` | `{from, to, profile: 'driving-car'\|'foot-walking'}` → geometry + maneuvers (cached) |
| `POST /api/assistant/command` | `{text, appState}` → validated function call + reply text |
| `POST /api/assistant/speech` | `{text}` → audio (ElevenLabs) or 503 → client uses browser TTS |
| `POST /api/reports` | Community report (rate-limited) |
| `GET /api/analytics/occupancy?from=&to=&bucket=` | Time-bucketed series with quality |
| `POST /api/admin/seed-simulation` | Analytics seeder; requires `ADMIN_TOKEN`; disabled in prod unless `DEMO_SEEDER=1` |

Cross-cutting rules:
- **Demo occupancy** travels as `demoOverrides` in the request, so a session's simulation never touches shared state.
- **Middleware:** CORS allow-list, rate limit (e.g. 60 req/min/IP, assistant 10/min), 8 s provider timeout, and no request-body logging for assistant endpoints.

## 10. UI & design system

**Theme:** dark only.

```css
:root {
  --bg: #101916;          --surface: #16221D;    --surface-2: #1E2D27;
  --border: #2A3B34;      --text: #F2F7F4;       --text-muted: #A3B5AC;
  --primary: #22C55E;     --primary-fg: #0B1410; /* dark text on green: white fails WCAG */
  --mint: #EAF6ED;        --warning: #F59E0B;    --danger: #EF4444;
  --q-confirmed: #22C55E; --q-estimated: #38BDF8; --q-unknown: #8A9A92; --q-simulated: #A78BFA;
}
```

- **Typography:** one sans family (e.g. Inter), tabular numbers for times and costs.
- **Shape:** 16 px card radius, restrained shadows, no heavy glassmorphism.

**Mobile (primary):**
- the map fills the screen, with a floating search bar and floating action buttons;
- a bottom sheet with 3 snap points (peek / half / full) for results and details;
- safe-area insets and touch targets of at least 44 px.

**Desktop:** a 400 px left panel (search, filters, cards, details) next to a large map. Do not just stretch the mobile layout.

**Screens / states:**
1. Explore
2. Search
3. Results (3 modes)
4. Details
5. Compare
6. Driving navigation
7. Walking navigation
8. Assistant
9. Preferences
10. Demo controls
11. Analytics
12. Login (optional)
13. Report

Each screen has loading (skeletons), empty, error, offline, permission-denied, rate-limited and demo-data states.

## 11. Priorities

### 11.1 Feature tiers

**P0 (must work by end of day 1, deployed):**
- PWA shell and map of Timișoara with attribution
- search + preset destinations
- OSM parkings (static GeoJSON) with quality badges
- SmartMatch with Fastest + one other mode
- real driving route geometry
- Demo Simulation Mode with the offline route fallback
- public HTTPS deployment, no login, demo labels

**P1 (day 2, core differentiators):**
- all 3 modes + compare
- rerouting scenario
- driving → walking transition
- live GPS mode
- park-and-ride with GTFS stops (scheduled)
- freshness and confidence UI
- first usability tests

**P2 (only when P0 and P1 are stable):**
- Gemini assistant
- ElevenLabs voice
- Tiger Data analytics
- community reports (+ Auth0)

**P3 (only if time is left):**
- computer-vision occupancy (authorized images only; no faces or plates)
- predictive availability
- wheelchair routing
- 3D navigation
- user accounts

### 11.2 Sponsor challenges (pick a few, do them well)

| Challenge | Decision | Why |
|---|---|---|
| Green Mobility (main) | **Yes** | Core product |
| NetRom "Glue It Together" | **Yes** | Map + routing + data + Gemini + TTS + DB are already one pipeline |
| Vest Ventures Living Labs | **Yes** | Needs real tests: §13, checklist |
| Gemini | **Yes (P2)** | Function calling that changes app state |
| ElevenLabs | **Yes (P2)** | Natural pairing with the assistant |
| Tiger Data | **Yes (P2)** | Occupancy time series + continuous aggregates |
| Vultr | **Yes, if backend runs there** | Near-zero extra cost |
| Auth0 | Maybe | Only for trusted reports; never gate the demo |
| Entire | Only if the team already uses it | Needs real evidence of use |
| Solana | **No** | No genuine use case; risks the MVP |

Organizers must confirm eligibility for each challenge **[VERIFY]**.

## 12. Live demo script (≈4 min)

1. **Open the URL:** map of Timișoara, one sentence on the problem.
2. **Try Demo, then Piața Victoriei:** parkings appear with honest quality badges.
3. **Fastest / Cheapest / Greenest:** show why the winners differ (comparison table, km of driving avoided).
4. **Start the simulated navigation:** the car follows the real route; ETA and distance update.
5. **Scenario "Parking A full":** the banner appears, the presenter taps **Switch**, and the new route animates in.
6. **Assistant:** say or type "cheaper parking, max 5 minutes walking". Show the function call and the new recommendation, spoken (ElevenLabs or browser TTS).
7. **Arrival:** the walking route to Piața Victoriei.
8. **Analytics:** occupancy trends, labeled simulated vs. real.
9. **QR code:** judges try it on their own phones.
10. **Tech close:**
    - architecture slide
    - SmartMatch tests
    - user-testing before/after
    - what is real, estimated, simulated or future

**Backup:** a recorded screen capture of steps 2–7. Steps 2–5 and 7 work with Gemini, ElevenLabs and openrouteservice all down (bundled demo JSON).

## 13. Living Labs validation

- **Format:** 5–8 participants, ~5 min each, anonymous IDs (P1…P8).
- **Task:** "Find a good parking for Piața Unirii and start navigation."
- **Measure:**
  - task success
  - time to choose
  - number of hesitations / wrong taps
  - clarity (1–5)
  - one free-text suggestion
- **Round 1 → fix the top 3 issues → round 2** on the same task, then show the before/after numbers.
- Raw notes go in `docs/user-testing/`. Never fabricate participants or results.

**Interview questions:**
1. How do you find parking in Timișoara today?
2. What frustrates you most?
3. Would you walk longer to avoid searching?
4. Which matters most: time, price or availability?
5. Was the recommendation easy to understand?
6. What would you improve?

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| No live occupancy data | Honest `simulated` / `estimated` labels; pitch the decision engine, not the sensor |
| Routing / geocoding quota or outage | Backend LRU cache, matrix instead of N calls, bundled demo JSON, preset destinations |
| Tile provider outage | OpenFreeMap primary, MapTiler key as fallback style |
| Mixed content / CORS | HTTPS backend on a domain from day 1; CORS allow-list |
| Judges sharing one demo state | Simulation is per session (`demoOverrides`) |
| Speech recognition unsupported / noisy room | Text input always visible; demo with text if needed |
| ElevenLabs / Gemini quota | Per-session caps, audio cache, browser TTS / keyword parser fallback |
| iOS GPS heading null, screen sleep | Bearing from positions; Wake Lock; demo mode needs no GPS |
| GTFS not available or wrong license | Park-and-ride becomes "nearest stop + lines" only, or is cut; say so |
| Late integration / merge conflicts | Shared zod contracts on day 1, small PRs, deploy on every merge to `main` |
| Scope creep | Feature freeze Nov 15 morning [DECIDE exact hour]; afterwards only bug fixes and the pitch |

## 15. Team & timeline

**Roles:**
- **M1 — Frontend & design system:** layout, bottom sheet, cards, states, accessibility.
- **M2 — Map & navigation:** MapLibre, GPS, simulation engine, rerouting UI, walking transition.
- **M3 — Backend & infra:** Express, provider proxies, cache, Vultr + Caddy deploy, database / Tiger Data.
- **M4 — SmartMatch & AI:** engine and its tests, Gemini functions, TTS.
- **Shared:** M1 + M4 run the Living Labs tests; M3 handles parking data / OSM export; the whole team does the demo prep.

**First hour, everyone:**
- agree on the `shared/` zod contracts and the static parking GeoJSON format;
- scaffold the monorepo;
- set up CI / deploy.

**Timeline (adjust to the official schedule [VERIFY]):**
- **Day 1:**
  - scaffold, contracts, map, search
  - parking GeoJSON
  - `/api/routes` + `/api/recommendations` (Fastest)
  - cards, simulated navigation
  - **deploy P0**
- **Day 2:**
  - 3 modes, rerouting scenario, walking transition
  - live GPS, park-and-ride
  - usability round 1 → fixes → round 2
  - start P2
- **Day 3 morning:**
  - feature freeze
  - mobile QA (Android Chrome + iPhone Safari), QR check
  - backup recording, README, challenge submissions, pitch rehearsal

### First vertical slice (milestone 1)
1. Open the deployed URL and see the map of Timișoara.
2. Pick "Piața Victoriei" (preset or search).
3. OSM parkings within 1.5 km appear with quality badges.
4. The top recommendation is computed by SmartMatch (Fastest).
5. The real driving route from the demo origin is drawn on the map.

**Tested by:** SmartMatch unit tests plus a Playwright smoke test of steps 1–5 against the deployed URL.

## 16. Definition of done

1. Opens from a public HTTPS link and a QR code; works on a phone.
2. A destination can be selected; real (OSM) parkings appear with accurate quality labels.
3. Useful options are compared, and the routed geometry is drawn.
4. Simulated navigation moves a marker along the route.
5. The rerouting scenario works.
6. The user can continue on foot.
7. Everything above works without Gemini, ElevenLabs or Auth0, and optional integrations fail visibly but gracefully.
8. No secrets in the client bundle or the repo.
9. The README explains setup, architecture, data sources, licenses, and what is real vs. simulated vs. future.
10. The demo is repeatable, and the backup recording exists.
