// Downloads, in ONE Overpass query (to spare the public servers):
//   - named streets: their way centres, used to place every street of the City Hall register on the map;
//   - a short list of major destinations the register does not contain (malls, stations, hospitals,
//     universities, stadiums, parks), e.g. Iulius Town from the spec's sample destinations.
// Writes shared/src/data/osm-streets.json and shared/src/data/osm-places.json.
//
// Usage: pnpm data:osm-places
// Data © OpenStreetMap contributors (ODbL).

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { overpass, TIMISOARA_BBOX } from './lib/overpass.mjs';

const bbox = TIMISOARA_BBOX.join(',');
const query = `
[out:json][timeout:120];
(
  way["highway"]["name"](${bbox});
  nwr["shop"="mall"]["name"](${bbox});
  nwr["railway"="station"]["name"](${bbox});
  nwr["amenity"~"^(hospital|university|bus_station)$"]["name"](${bbox});
  nwr["leisure"~"^(stadium|park)$"]["name"](${bbox});
);
out center tags;
`;

const CATEGORY = (t) =>
  t.shop === 'mall'
    ? 'mall'
    : t.railway === 'station'
      ? 'station'
      : t.amenity === 'bus_station'
        ? 'bus_station'
        : t.amenity === 'hospital'
          ? 'hospital'
          : t.amenity === 'university'
            ? 'university'
            : t.leisure === 'stadium'
              ? 'stadium'
              : t.leisure === 'park'
                ? 'park'
                : null;

const round = (n) => Math.round(n * 1e6) / 1e6;

async function main() {
  console.log('Fetching named streets and major places in Timișoara from Overpass');
  const json = await overpass(query);
  const fetchedAt = new Date().toISOString();

  const streets = new Map(); // name → way centres
  const places = [];
  for (const el of json.elements) {
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null || !t.name) continue;
    if (t.highway && el.type === 'way') {
      const list = streets.get(t.name) ?? [];
      list.push([round(lng), round(lat)]);
      streets.set(t.name, list);
      continue;
    }
    const category = CATEGORY(t);
    if (category) places.push({ id: `osm-${el.type}-${el.id}`, name: t.name, category, lat: round(lat), lng: round(lng) });
  }

  const write = (file, data) => {
    const path = fileURLToPath(new URL(file, import.meta.url));
    mkdirSync(dirname(path), { recursive: true });
    const body = { source: `OpenStreetMap via Overpass API, bbox ${bbox}`, fetchedAt, attribution: '© OpenStreetMap contributors (ODbL)', data };
    writeFileSync(path, JSON.stringify(body) + '\n', 'utf8');
    return path;
  };
  const streetList = [...streets.entries()].map(([name, points]) => ({ name, points }));
  console.log(`Wrote ${streetList.length} street names → ${write('../shared/src/data/osm-streets.json', { streets: streetList })}`);
  console.log(`Wrote ${places.length} places → ${write('../shared/src/data/osm-places.json', { places })}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
