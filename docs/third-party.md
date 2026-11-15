# Third-party code, data and services

The FLOW Coin in `frontend/src/features/motion/FlowCoin.tsx` is original layered SVG artwork.
Motion uses existing React/Lucide dependencies and original SVG artwork. Sprint 01 self-hosts the
Inter and Manrope variable fonts (Latin/Latin Extended) under SIL OFL 1.1; no new animation library.

Add a row before using any third-party code, data or service. A repository without a license cannot be copied.

| Name | Used for | License / terms | Obligations |
|---|---|---|---|
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | Map rendering | BSD-3-Clause | Keep the license notice (shipped in the npm package) |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) data | Parking locations, map data | ODbL 1.0 | Visible "© OpenStreetMap contributors" attribution; share-alike for derived databases |
| [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) (overpass-api.de, kumi.systems, private.coffee, maps.mail.ru) | One-off exports: parkings, named streets, major places, schools and kindergartens | Public instance usage policies | Low request volume, exponential backoff, no automated polling |
| [OpenFreeMap](https://openfreemap.org/) | Vector tiles and dark style | Free public instance; data OpenMapTiles + OSM | Keep attribution shown by the style |
| [openrouteservice / HeiGIT](https://openrouteservice.org/terms-of-service/) | Server-side driving, walking and cycling directions; driving and walking matrices at `api.heigit.org/openrouteservice/v2/` | Provider terms; OSM data ODbL | Backend-only key, cached requests, visible route source; no live traffic claims |
| [FOSSGIS routing](https://routing.openstreetmap.de/about.html) | Existing keyless walking/cycling OSRM fallback | Public server usage policy; OSM data ODbL | At most one request/second, bounded queue, team User-Agent, caching, OSM attribution and visible fix-the-map link; no SLA |
| [OSRM](https://project-osrm.org/) public demo service | Low-volume prototype driving directions when ORS is unconfigured | OSRM BSD-2-Clause; [demo usage policy](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy); OSM data ODbL | Cache requests, no polling or SLA assumptions; replace with provisioned routing for production; visible OSM attribution |
| [Primăria Timișoara](https://ghid-pmt.vercel.app/unihack) — Timpark endpoint `cont.primariatm.ro/api/mobile/parking` | Paid parking zones, lots, streets, tariffs, SMS codes | Public City Hall endpoint, GET only, no uptime guarantee | Snapshot via `pnpm data:city`, User-Agent naming the team, show source and date in the UI |
| Primăria Timișoara — street register `servicii.primariatm.ro/api/nomenclator/strazi`, landmarks `/api/mobile/pois`, neighbourhoods `/api/zones` | Destination search | Public City Hall endpoints, GET only | Snapshot via `pnpm data:city`; landmark descriptions and images are not copied |
| React, Vite, Tailwind CSS, Express, zod, lucide-react | App framework and libraries | MIT / ISC | Keep license notices (npm packages) |
| [SMTT GTFS Schedule](https://smtt.ro/transit/gtfs/maps/smtt-timisoara-ro.zip) | Optional build/backend transit schedule snapshot | Official public source; redistribution terms not independently verified | Source/version/date/checksum retained; static schedules only; no endorsement. SMTT 4.32 normalized schedule committed from the user-supplied archive with verified checksum; original download time and direct publisher retrieval remain unknown. See `bio-pacer-stpt.md` |
| [Python standard library](https://docs.python.org/3/license.html) — `zipfile`, `csv`, `urllib` | Bounded operator-only GTFS ingestion | PSF License Agreement; existing Python runtime, no vendored library code | Python 3.10+ required for ingestion/security tests; no pip/npm dependency added; preserve runtime notices if distributing Python |

| Name | Used for | License / terms | Obligations |
|---|---|---|---|
| [Natural Earth Admin-1](https://github.com/nvkelso/natural-earth-vector) | Real generalized Timiș county polygon (RO-TM) | Public domain; upstream statement retained in `docs/data-sources/natural-earth-public-domain.txt` | Preserve metadata/source/date/precision note; not cadastral accuracy |

The fallback map draws already attributed municipal Timpark geometries, not a fabricated street grid.
Inter and Manrope are redistributed from pinned `@fontsource-variable` packages under SIL OFL 1.1,
with original copyright/license files in `docs/data-sources/{inter,manrope}-OFL.txt` and deployed
`frontend/public/licenses/`. Local `fonts.css` retains the package unicode subsets and uses swap.
System fallbacks remain available; no proprietary font or copied interface artwork is included.

| Inter / Manrope variable fonts | Body / display typography and Romanian diacritics | SIL OFL 1.1 | Preserve original copyright and OFL, distributed at `/licenses/inter-OFL.txt` and `/licenses/manrope-OFL.txt`; no font modification or standalone sale |

| Name | Used for | License / terms | Obligations |
|---|---|---|---|
| [ElevenLabs React/client SDK](https://github.com/elevenlabs/packages) | Authenticated FLOW Voice conversations and client tool transport | MIT (npm packages include license) | Preserve package notices; backend-only API key, user-initiated microphone, provider terms apply to the connected workspace |
| [LiveKit client](https://github.com/livekit/client-sdk-js) | WebRTC transport used by the official ElevenLabs SDK | Apache-2.0 | Preserve package license/NOTICE; verify WebRTC connectivity on target devices |

### FLOW Identity

- `@auth0/auth0-react` / Auth0 SPA SDK — MIT, official PKCE/Universal Login integration.
- `express-oauth2-jwt-bearer` — MIT, official Express access-token validation.
- `pg` — MIT, parameterized PostgreSQL access.
- `sharp` — Apache-2.0 (libvips LGPL-2.1-or-later and bundled codec notices apply), safe avatar decoding/re-encoding. Retain package notices when redistributing.
- `jose` — MIT, development tests only; local RS256 signing is never an authentication bypass in the product.

The image crop UI uses browser Canvas and original application code. Team/initials artwork uses existing branding and lucide icons. No generated human portraits or unsupplied team identities were introduced.
