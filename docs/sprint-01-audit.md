# Sprint 01 technical audit

Starting checkout: `feature/premium-green-mobility` at `9d35ac2`; clean. Remote inspection found
`f476e37112862318fb37ad06f977491a7837b4fa` on main and the premium branch. Fast-forwarded before
creating `feature/flow-smart-journey`; preserves the team's map/navigation style-load fixes.

Reusable: municipal destination snapshots, SmartMatch candidate/access/price screening, ORS driving
and walking matrices, cached driving directions, ORS active directions, MapLibre, shell/themes,
Motion's server-evaluated activity and private prototype ledger. Existing compare/recommend APIs
remain available. Coordinates are GeoJSON [longitude, latitude].

Gap: direct `JourneyOption` cannot describe drive → parking → walk. Parking's matrix fallback is
straight-line × 1.3; useful screening estimate, never a route. Green Switch and its map callback
carry one geometry; they cannot distinguish legs. Preference ranking currently runs in React.

Strategy: extract the existing recommendation service without changing its API, add a shared
complete-journey contract and bounded backend orchestrator, route only the best three screened
parking candidates, and preserve each independent active mode. Return all deterministic preference
rankings in one response. Extend existing Green Switch and stable MapLibre sources with a timeline.
Keep provider unknowns explicit and Motion as the only authority for activity rewards.

Risks: matrix/directions disagreement, snapped endpoints, stale results, different currency tariffs,
parking-search time absent, unavailable ORS, overlapping map overlays and theme style replacement.
Validate geometry/units/leg continuity, cap requests/cache, reject overly distant snaps, abort stale
UI requests, test partial providers and reduced motion. No static GTFS planner or cycling snapshot
exists in this checkout; do not invent either. No unrelated sponsor integration in this sprint.
