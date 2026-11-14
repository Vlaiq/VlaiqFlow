// Downloads schools and kindergartens in Timișoara from OpenStreetMap in ONE Overpass query.
// They anchor the "Zone protejate la școli" feature: around a school at drop-off and pick-up times,
// SmartMatch does not send cars to the gate (spec §6.16). The City Hall publishes no school location list
// (checked in the hackathon guide on 14 Nov 2026), so OSM is the only open source.
//
// Writes shared/src/data/schools.osm.json. Usage: pnpm data:schools
// Data © OpenStreetMap contributors (ODbL).

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { overpass, TIMISOARA_BBOX } from './lib/overpass.mjs';

const bbox = TIMISOARA_BBOX.join(',');
const query = `
[out:json][timeout:90];
(
  nwr["amenity"~"^(school|kindergarten)$"](${bbox});
);
out center tags;
`;

const round = (n) => Math.round(n * 1e6) / 1e6;

async function main() {
  console.log('Fetching schools and kindergartens in Timișoara from Overpass');
  const json = await overpass(query);
  const fetchedAt = new Date().toISOString();
  const schools = [];
  for (const el of json.elements) {
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    // Closed or planned institutions are not protected.
    if (t['disused:amenity'] || t['abandoned:amenity'] || t.disused === 'yes') continue;
    schools.push({
      id: `osm-${el.type}-${el.id}`,
      name: t.name?.trim() || null,
      kind: t.amenity === 'kindergarten' ? 'kindergarten' : 'school',
      lat: round(lat),
      lng: round(lng),
    });
  }
  schools.sort((a, b) => a.id.localeCompare(b.id));
  const path = fileURLToPath(new URL('../shared/src/data/schools.osm.json', import.meta.url));
  mkdirSync(dirname(path), { recursive: true });
  const body = {
    source: `OpenStreetMap via Overpass API (amenity=school|kindergarten), bbox ${bbox}`,
    fetchedAt,
    attribution: '© OpenStreetMap contributors (ODbL)',
    data: { schools },
  };
  writeFileSync(path, JSON.stringify(body) + '\n', 'utf8');
  const named = schools.filter((s) => s.name).length;
  console.log(`Wrote ${schools.length} schools/kindergartens (${named} named) → ${path}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
