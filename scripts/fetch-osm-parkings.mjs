// Downloads real parking locations in Timișoara from OpenStreetMap (Overpass API)
// and writes shared/src/data/parkings.osm.json in the shared Parking schema.
//
// Usage: pnpm data:parkings   (or: node scripts/fetch-osm-parkings.mjs)
//
// Data © OpenStreetMap contributors, ODbL — attribution must stay visible on the map.
// Nothing here is invented: unknown fields are written as quality "unknown".
// Hand-check the demo-area parkings afterwards (see docs/team-checklist.md).

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Public Overpass instances, tried in order (the main one is often overloaded).
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
// Bounding box around Timișoara: south, west, north, east
const BBOX = [45.7, 21.15, 45.81, 21.31];

const query = `
[out:json][timeout:90];
nwr["amenity"="parking"](${BBOX.join(',')});
out center tags;
`;

const OUT_FILE = fileURLToPath(new URL('../shared/src/data/parkings.osm.json', import.meta.url));

const SOURCE = 'OpenStreetMap';
const unknown = () => ({ value: null, quality: 'unknown', source: 'none' });

function parseCount(raw) {
  if (raw == null || !/^\d+$/.test(String(raw).trim())) return null;
  return Number.parseInt(raw, 10);
}

function parkingType(tags) {
  if (tags.park_ride && tags.park_ride !== 'no') return 'park_and_ride';
  switch (tags.parking) {
    case 'surface':
      return 'surface';
    case 'multi-storey':
      return 'multi-storey';
    case 'underground':
      return 'underground';
    case 'street_side':
    case 'lane':
    case 'on_kerb':
    case 'half_on_kerb':
      return 'street_zone';
    default:
      return 'other';
  }
}

function toParking(el) {
  const tags = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) return null;
  if (['private', 'no'].includes(tags.access)) return null;

  const capacity = parseCount(tags.capacity);
  const capacityDisabled = parseCount(tags['capacity:disabled']);

  return {
    id: `osm-${el.type}-${el.id}`,
    name: tags.name ?? tags.operator ?? 'Parcare fără nume',
    lat,
    lng,
    type: parkingType(tags),
    // OSM is crowd-sourced: treat counts as "estimated" until a human verifies them.
    capacity: capacity == null ? unknown() : { value: capacity, quality: 'estimated', source: `${SOURCE} capacity tag` },
    capacityDisabled:
      capacityDisabled == null
        ? unknown()
        : { value: capacityDisabled, quality: 'estimated', source: `${SOURCE} capacity:disabled tag` },
    // Prices are never taken from OSM free text; only fee=no gives a defensible 0 RON (still "estimated").
    price: tags.fee === 'no' ? { value: { perHourRon: 0, note: 'fee=no in OSM' }, quality: 'estimated', source: `${SOURCE} fee tag` } : unknown(),
    // No live occupancy source exists yet (spec §5.2).
    availability: unknown(),
    source: `${SOURCE} ${el.type}/${el.id}`,
  };
}

async function main() {
  let json;
  for (const url of OVERPASS_URLS) {
    console.log(`Querying ${url} for amenity=parking in Timișoara…`);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'VLAIQ-Flow-hackathon-prototype',
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      json = await res.json();
      break;
    } catch (err) {
      console.warn(`  failed: ${err.message}`);
    }
  }
  if (!json) throw new Error('All Overpass instances failed — try again in a few minutes.');
  const parkings = json.elements.map(toParking).filter(Boolean);

  const out = {
    parkings,
    dataset: {
      source: `OpenStreetMap via Overpass API, bbox ${BBOX.join(',')}`,
      generatedAt: new Date().toISOString(),
      attribution: '© OpenStreetMap contributors (ODbL)',
    },
  };

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${parkings.length} parkings to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
