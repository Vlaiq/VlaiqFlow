// Downloads real parking locations in Timișoara from OpenStreetMap (Overpass API)
// and writes shared/src/data/parkings.osm.json in the shared Parking schema.
//
// Usage: pnpm data:parkings   (or: node scripts/fetch-osm-parkings.mjs)
//
// Data © OpenStreetMap contributors, ODbL — attribution must stay visible on the map.
// Nothing here is invented: unknown fields are written as quality "unknown".
// Unnamed parkings get a descriptive name from their position at load time (shared/src/geo.ts),
// clearly marked as derived.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { overpass, TIMISOARA_BBOX } from './lib/overpass.mjs';

const query = `
[out:json][timeout:90];
nwr["amenity"="parking"](${TIMISOARA_BBOX.join(',')});
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
  const name = tags.name ?? tags.operator ?? null;

  return {
    id: `osm-${el.type}-${el.id}`,
    // Real OSM name, or a placeholder replaced by a position-based name when the backend loads the data.
    name: name ?? 'Parcare fără nume',
    nameIsDerived: name == null,
    lat,
    lng,
    type: parkingType(tags),
    access: ['yes', 'public', 'permissive', 'destination'].includes(tags.access)
      ? 'public'
      : tags.access === 'customers'
        ? 'customers'
        : 'unknown',
    operator: tags.operator ?? null,
    // OSM is crowd-sourced: treat counts as "estimated" until a human verifies them.
    capacity: capacity == null ? unknown() : { value: capacity, quality: 'estimated', source: `${SOURCE} capacity tag` },
    capacityDisabled:
      capacityDisabled == null
        ? unknown()
        : { value: capacityDisabled, quality: 'estimated', source: `${SOURCE} capacity:disabled tag` },
    // Prices are never taken from OSM free text; only fee=no gives a defensible 0 (still "estimated").
    price: tags.fee === 'no' ? { value: { perHourRon: 0, note: 'fee=no in OSM' }, quality: 'estimated', source: `${SOURCE} fee tag` } : unknown(),
    // No live occupancy source exists yet (spec §5.2).
    availability: unknown(),
    source: `${SOURCE} ${el.type}/${el.id}`,
  };
}

async function main() {
  console.log('Fetching amenity=parking in Timișoara from Overpass');
  const json = await overpass(query);
  const parkings = json.elements.map(toParking).filter(Boolean);
  const out = {
    parkings,
    dataset: {
      source: `OpenStreetMap via Overpass API, bbox ${TIMISOARA_BBOX.join(',')}`,
      generatedAt: new Date().toISOString(),
      attribution: '© OpenStreetMap contributors (ODbL)',
    },
  };
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${parkings.length} parkings to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
