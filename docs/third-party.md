# Third-party code, data and services

Add a row before using any third-party code, data or service. A repository without a license cannot be copied.

| Name | Used for | License / terms | Obligations |
|---|---|---|---|
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | Map rendering | BSD-3-Clause | Keep the license notice (shipped in the npm package) |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) data | Parking locations, map data | ODbL 1.0 | Visible "© OpenStreetMap contributors" attribution; share-alike for derived databases |
| [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) (overpass-api.de, kumi.systems, private.coffee, maps.mail.ru) | One-off exports: parkings, named streets, major places | Public instance usage policies | Low request volume, exponential backoff, no automated polling |
| [OpenFreeMap](https://openfreemap.org/) | Vector tiles and dark style | Free public instance; data OpenMapTiles + OSM | Keep attribution shown by the style |
| [Primăria Timișoara](https://ghid-pmt.vercel.app/unihack) — Timpark endpoint `cont.primariatm.ro/api/mobile/parking` | Paid parking zones, lots, streets, tariffs, SMS codes | Public City Hall endpoint, GET only, no uptime guarantee | Snapshot via `pnpm data:city`, User-Agent naming the team, show source and date in the UI |
| Primăria Timișoara — street register `servicii.primariatm.ro/api/nomenclator/strazi`, landmarks `/api/mobile/pois`, neighbourhoods `/api/zones` | Destination search | Public City Hall endpoints, GET only | Snapshot via `pnpm data:city`; landmark descriptions and images are not copied |
| React, Vite, Tailwind CSS, Express, zod, lucide-react | App framework and libraries | MIT / ISC | Keep license notices (npm packages) |
