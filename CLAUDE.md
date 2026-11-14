# VLAIQ FLOW — agent instructions

Parking-first, multimodal navigation PWA for Timișoara. Built by team **VLAIQ** (4 students) at UniHack 2026 (Nov 13–15), main track **Green Mobility**.

- Full requirements: `docs/spec.md`. Read the section for the feature you are touching before you change it.
- Things only humans can do (rules, licenses, accounts, user tests): `docs/team-checklist.md`. Do not pretend to have done them.
- The City Hall's hackathon guide (https://ghid-pmt.vercel.app/unihack) lists the official data, endpoints and pitfalls. Spec §5.2 summarises it. We extend the city's **CityApp**, Timpark and Sesizări; we do not duplicate them (spec §2).
- Product name **VLAIQ FLOW** (final since 14 Nov 2026), tagline "Park smarter. Move greener.", production domain **vlaiqflow.ro**. Keep all branding in `shared/src/brand.ts`. Never rename the team.

## Non-negotiable rules

1. **Data integrity.** Every parking, availability, price, duration or emission value carries a `quality` field (`confirmed | estimated | unknown | simulated`) and a `source`. Never invent parking locations, prices, occupancy, sensor readings, API responses, test results or user interviews. Missing data is shown as "Unknown".
2. **Real geometry only.** Routes come from the routing provider's geometry. Never draw a straight line and present it as a route.
3. **SmartMatch is deterministic code** (`backend/src/engines/smartmatch`). Gemini only turns text into one whitelisted function call with zod-validated arguments. It never produces numbers, routes, prices or availability.
4. **Secrets stay on the backend** in env vars. Anything prefixed `VITE_` is public. Keep `.env.example` up to date and never commit `.env`.
5. **Graceful degradation.** The core flow (map → destination → parkings → route → simulated navigation → walking) must work when Gemini, ElevenLabs, Auth0 or the database are down. Each optional integration shows a visible fallback.
6. **Demo simulation is per client session.** It never changes data that other viewers see. Judges will run the demo simultaneously.
7. **Respect provider policies.** No Nominatim autocomplete. Debounce search (300 ms). Cache route and matrix responses. Show OpenStreetMap / tile attribution on the map.
8. **Verify before claiming.** Run the code or the tests before saying something works. Report status as done / partial / blocked.
9. **Third-party code.** Check the license before copying anything and record it in `docs/third-party.md`. A repo with no license cannot be reused.
10. **Scope discipline.** Do not start P2/P3 work (spec §11) while any P0 item is broken. Do not rewrite working modules.
11. **City Hall endpoints** (`*.primariatm.ro` only): call them from the backend or `scripts/`, never per user request; snapshot the result into `shared/src/data` with its date and version; send a `User-Agent` naming the team. Check coordinate order ([lng, lat] vs [lat, lng]) against a known point.
12. **No second inbox, no payments.** Problems link to Sesizări; parking payment hands off to Timpark SMS / CityApp.
13. **Romanian first** in the UI (English second), plain wording, WCAG 2.1 AA.
14. **Privacy page stays true.** `frontend/src/features/trust/PrivacyScreen.tsx` (`/confidentialitate`) lists every place personal data goes. Update it in the same change whenever a feature starts sending location, text or identifiers to a new provider, or stores something new.
15. **Adoptable:** open-source, a README anyone can follow, no paid service on a personal account (spec §17).

## Stack (decided — change only with team agreement)

| Area | Choice |
|---|---|
| Monorepo | pnpm workspaces: `frontend`, `backend`, `shared` |
| Frontend | React 18 + TypeScript (strict) + Vite, Tailwind, shadcn/ui, lucide-react, Motion (sparingly) |
| Map | MapLibre GL JS, OpenFreeMap vector tiles (no key); MapTiler as fallback |
| City data | Timpark zones/lots/streets + tariffs, SMTT GTFS, neighbourhoods, street register — City Hall endpoints, snapshotted |
| Routing | openrouteservice (directions, matrix) via backend proxy |
| Destination search | Local: street register + City Hall landmarks + presets; ORS geocoding only as a labelled fallback |
| Format | Installable web app (PWA) — confirmed as allowed by the organizers (spec D8) |
| Backend | Node 22 + Express + zod, deployed on a Vultr VM behind Caddy (HTTPS on a real domain) |
| Database | Postgres on Tiger Cloud (TimescaleDB + PostGIS). Not required for P0 |
| AI | Gemini API function calling (server-side) |
| Voice | Web Speech API; ElevenLabs TTS server-side with browser TTS fallback |
| Tests | Vitest (SmartMatch unit tests are mandatory), one Playwright smoke test of the demo flow |

## Repo layout

```text
frontend/src/{app,components,features/{map,parking,routing,navigation,assistant,analytics},hooks,services,styles}
backend/src/{routes,services,adapters,engines/smartmatch,middleware}
shared/src/{types,schemas,brand.ts,data}   # API contracts (zod) + static parking GeoJSON
database/{migrations,seeds}
docs/{spec.md,team-checklist.md,third-party.md,data-sources/,user-testing/,challenge-evidence/}
```

API request and response types are defined **once** in `shared/src/schemas` (zod), and both sides import them.

## Conventions

- Clean up `watchPosition`, `requestAnimationFrame`, intervals and map listeners on unmount.
- Keep map data out of React state where possible: update MapLibre sources directly and avoid re-rendering on every GPS tick.
- UI is dark-theme only. Use the tokens in `frontend/src/styles/tokens.css`. Text on the green primary color is **dark** (`--primary-fg`), never white, because white fails contrast.
- Data-quality badges always include a text label, never color alone.
- Every feature has loading, empty, error and permission-denied states.

## Commands

- `pnpm install` — install all workspaces
- `pnpm dev` — frontend on http://localhost:5173 (proxies `/api`) + backend on http://localhost:8787
- `pnpm test` / `pnpm typecheck` — all packages
- `pnpm data:parkings` — regenerate `shared/src/data/parkings.osm.json` from OpenStreetMap
- `pnpm data:city` — refresh the City Hall snapshots (Timpark, street register, landmarks, neighbourhoods); restart the backend afterwards
- `pnpm data:osm-places` — refresh OSM named streets and major places (one Overpass query); restart the backend afterwards
- `pnpm data:schools` — refresh OSM schools and kindergartens for the school drop-off zones (spec §6.16); restart the backend afterwards
- `pnpm data:demo-routes` — with `pnpm dev` running, save the real DEMO routes (Gara de Nord → Piața Victoriei parkings) used when the routing provider is down (spec §6.23); restart the backend afterwards
- `pnpm -F backend start` — run the backend without watch (production on Vultr)
- If a change in `shared/` does not show in the browser, restart the frontend dev server: Vite's watcher has missed edits there (seen on 13 Nov). Check with the tests first, then in the browser.
