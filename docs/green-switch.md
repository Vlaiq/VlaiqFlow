# Green Switch · current complete-journey planner

Sprint 01 connects Green Switch to `POST /api/journeys/complete`: actual drive → parking → walk,
independent active routes, all preference rankings computed by the backend, synchronized map and timeline.
See [complete journey architecture](complete-journeys.md) for the current UI contract and limitations.
The original direct `/compare` API below is retained for compatibility; it no longer drives Explore.

# Original direct comparison API

`POST /api/journeys/compare` accepts strict JSON `{ origin: [lng,lat], destination: [lng,lat] }`.
The origin must be an explicit GPS/manual choice; the UI never substitutes a demo origin.
The current routing coverage is the Timișoara prototype area (21–21.5 longitude,
45.6–45.9 latitude). A county-wide map does not imply county-wide provider coverage.

Driving reuses the existing navigation route service. Walking and cycling use only
openrouteservice's `foot-walking` and `cycling-regular` GeoJSON directions profiles.
`ORS_API_KEY` stays on the backend. There is no straight-line or driving-profile fallback
for an active route. Missing configuration, access denial, bad data or an upstream
failure creates a mode-specific unavailable explanation, not invented geometry.

Requests deduplicate by rounded origin/destination and retain full successful comparisons
for five minutes; a partial/failed comparison uses a 15-second backoff. Cache size is
bounded to 100 entries. Upstream requests time out at 15 seconds; the browser cancels
superseded comparisons and has a 20-second timeout. A preference switch selects among
existing routes and never spends another provider request.

Preferences are distinct from parking preferences:

- Cea mai rapidă: shortest provider duration among calculated routes.
- Echilibrată: active route when it adds at most five minutes; otherwise shortest duration.
- Mai ecologică: shortest practical active route, when one exists. This does not quantify emissions.

Prototype practicality policy: walking at most 35 minutes, cycling at most 45 minutes.
FLOW Opportunity additionally needs an actual driving comparison and an active route
adding no more than 15 minutes. A walk of at most 20 minutes is preferred before cycling.
These are transparent product limits, not a claim of route safety, accessibility or mode certainty.

The driving comparison is explicitly **direct driving**, without parking-search time,
parking charges or the final walking leg. Those remain in SmartMatch and parking details.
No fuel, ticket prices, avoided emissions, bike-lane safety or live traffic is fabricated.
Transit is unavailable here until a suitable real-data routing integration exists.

Selecting walking/cycling can open Motion with an `ActiveJourneyContext` containing only
the destination ID/name and calculated summary metrics. It does not request GPS or award coins.
The existing Motion foreground recording and server eligibility flow must still complete.

UI component: `frontend/src/features/journey/GreenSwitch.tsx` with props `origin`,
`destination`, `onRoute`, and `onStartActivity`. Route selection sends only the selected
provider geometry to the existing map. Source and update time are in progressive details.

Tests beside `shared/src/schemas/journey.ts` verify preference/opportunity policy,
unknown inputs and unsupported metrics. Backend tests use clearly synthetic fixtures
to verify actual profile URLs, geometry preservation, caching/deduplication and graceful
provider failures. Real active routes still require a working backend ORS binding and
network access to `api.openrouteservice.org`; tests do not establish that access.
