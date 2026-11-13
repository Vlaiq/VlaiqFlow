# VLAIQ FLOW

**Park smarter. Move greener.** A parking-first, multimodal navigation PWA for Timișoara, built by team **VLAIQ** at UniHack 2026 (Green Mobility track).

> Status: project skeleton. Real parking locations come from OpenStreetMap. **Availability is not live data yet** and is shown as "Unknown".

## Requirements

- Node.js 20.11+ (LTS recommended)
- pnpm 9 (`npm install -g pnpm` or `corepack enable`)
- git

## Setup

```bash
pnpm install
cp backend/.env.example backend/.env      # fill in ORS_API_KEY when routing is added
cp frontend/.env.example frontend/.env
pnpm data:parkings                        # downloads OSM parkings for Timișoara
pnpm dev                                  # frontend http://localhost:5173, backend http://localhost:8787
```

On Windows PowerShell use `Copy-Item` instead of `cp`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Runs frontend (Vite) and backend (tsx watch) together |
| `pnpm test` | Runs Vitest in every package |
| `pnpm typecheck` | TypeScript check in every package |
| `pnpm build` | Production build of the frontend |
| `pnpm data:parkings` | Regenerates `shared/src/data/parkings.osm.json` from OpenStreetMap |

## Structure

```text
frontend/   React + Vite + Tailwind + MapLibre (PWA)
backend/    Express API; proxies every keyed provider, so no secrets reach the browser
shared/     zod schemas (API contracts), branding, static data
scripts/    data preparation (OSM export)
docs/       spec, team checklist, third-party licenses
```

## Data honesty

Every value carries a quality label: confirmed, estimated, unknown or simulated. We never present simulated or estimated data as real-time city data. See `docs/spec.md` §5.

## Attribution

Map data © OpenStreetMap contributors (ODbL). Tiles by OpenFreeMap / OpenMapTiles. See `docs/third-party.md`.
