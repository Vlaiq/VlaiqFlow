// Downloads, in ONE Overpass query, every named place in Timișoara that people go to: shops,
// supermarkets, restaurants, pharmacies, clinics, banks, fuel, schools, hotels, museums, theatres,
// churches, public offices, sports venues, sights and public transport stops. These make spoken and
// typed destinations ("Kaufland", "Teatrul Național", "Catedrala") findable. Parkings are separate.
// Writes shared/src/data/osm-pois.json.
//
// Usage: pnpm data:osm-pois   (then restart the backend)
// Data © OpenStreetMap contributors (ODbL).

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { overpass, TIMISOARA_BBOX } from './lib/overpass.mjs';

const bbox = TIMISOARA_BBOX.join(',');
const query = `
[out:json][timeout:180];
(
  nwr["name"]["amenity"](${bbox});
  nwr["name"]["shop"](${bbox});
  nwr["name"]["tourism"](${bbox});
  nwr["name"]["leisure"](${bbox});
  nwr["name"]["office"](${bbox});
  nwr["name"]["healthcare"](${bbox});
  nwr["name"]["historic"](${bbox});
  node["name"]["railway"~"^(station|halt|tram_stop)$"](${bbox});
  node["name"]["highway"="bus_stop"](${bbox});
  // The airport lies just outside the city box.
  nwr["name"]["aeroway"="aerodrome"](45.65,21.1,45.86,21.4);
);
out center tags;
`;

const FOOD = /^(restaurant|cafe|fast_food|bar|pub|ice_cream|food_court|biergarten)$/;
const CULTURE = /^(theatre|cinema|arts_centre|library|community_centre|events_venue|nightclub|conference_centre)$/;
const PUBLIC = /^(townhall|police|post_office|courthouse|fire_station|embassy|public_building)$/;
const SPORT = /^(sports_centre|swimming_pool|fitness_centre|ice_rink|sports_hall|track|pitch)$/;

/** The app's category for an OSM object, or null for things nobody travels to (benches, ATMs…). */
export function category(t) {
  const a = t.amenity;
  if (a === 'parking' || a === 'parking_space' || a === 'parking_entrance') return null; // own dataset
  if (t.aeroway === 'aerodrome') return 'airport';
  if (t.shop === 'mall') return 'mall';
  if (t.shop && /^(supermarket|hypermarket|convenience|wholesale)$/.test(t.shop)) return 'supermarket';
  if (a === 'hospital') return 'hospital';
  if (a === 'university') return 'university';
  if (a === 'school' || a === 'college') return 'school';
  if (a === 'kindergarten') return 'kindergarten';
  if (a === 'bus_station') return 'bus_station';
  if (a && FOOD.test(a)) return 'food';
  if (a === 'pharmacy' || t.shop === 'chemist') return 'pharmacy';
  if ((a && /^(clinic|doctors|dentist)$/.test(a)) || t.healthcare) return 'health';
  if (a === 'bank') return 'bank';
  if (a === 'fuel') return 'fuel';
  if (a === 'charging_station') return 'charging';
  if (a === 'marketplace') return 'market';
  if (a === 'place_of_worship') return 'worship';
  if ((a && CULTURE.test(a)) || t.tourism === 'museum' || t.tourism === 'gallery') return 'culture';
  if (a && PUBLIC.test(a)) return 'public';
  if (t.railway === 'station' || t.railway === 'halt') return 'station';
  if (t.railway === 'tram_stop' || t.highway === 'bus_stop') return 'stop';
  if (t.tourism && /^(hotel|hostel|guest_house|motel|apartment)$/.test(t.tourism)) return 'hotel';
  if (t.tourism && /^(attraction|viewpoint|zoo|theme_park)$/.test(t.tourism)) return 'attraction';
  if (t.historic && /^(monument|memorial|castle|building|church|fort|city_gate)$/.test(t.historic))
    return 'attraction';
  if (t.leisure === 'park' || t.leisure === 'garden') return 'park';
  if (t.leisure === 'stadium') return 'stadium';
  if (t.leisure && SPORT.test(t.leisure)) return 'sport';
  if (t.shop) return 'shop';
  if (t.office) return 'office';
  return null;
}

const round = (n) => Math.round(n * 1e6) / 1e6;

async function main() {
  console.log('Fetching named places in Timișoara from Overpass');
  const json = await overpass(query);
  if (!json) throw new Error('Overpass is not available right now; nothing was written.');
  const fetchedAt = new Date().toISOString();
  const places = [];
  for (const el of json.elements) {
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null || !t.name) continue;
    const c = category(t);
    if (!c) continue;
    const aliases = [...new Set([t.brand, t.alt_name, t.old_name, t['name:ro'], t.official_name, t.short_name])]
      .filter((a) => a && a !== t.name)
      .slice(0, 4);
    places.push({
      id: `osm-${el.type}-${el.id}`,
      name: t.name.trim(),
      category: c,
      lat: round(lat),
      lng: round(lng),
      ...(aliases.length ? { aliases } : {}),
    });
  }
  const path = fileURLToPath(new URL('../shared/src/data/osm-pois.json', import.meta.url));
  mkdirSync(dirname(path), { recursive: true });
  const body = {
    source: `OpenStreetMap via Overpass API (named amenity/shop/tourism/leisure/office/healthcare/historic, stations and stops), bbox ${bbox}`,
    fetchedAt,
    attribution: '© OpenStreetMap contributors (ODbL)',
    data: { places },
  };
  writeFileSync(path, JSON.stringify(body) + '\n', 'utf8');
  const byCategory = places.reduce((m, p) => ((m[p.category] = (m[p.category] ?? 0) + 1), m), {});
  console.log(`Wrote ${places.length} places → ${path}`);
  console.log(byCategory);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
