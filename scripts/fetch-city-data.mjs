// Snapshots City Hall data into shared/src/data so the app never depends on the live endpoints.
// Rules from the City Hall hackathon guide (https://ghid-pmt.vercel.app/unihack):
//   GET only, *.primariatm.ro hosts only, a User-Agent naming the team, download once instead of polling.
//
// Usage: pnpm data:city

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const USER_AGENT = 'VLAIQ-UniHack2026-team';

const SOURCES = [
  {
    name: 'Timpark parking zones, lots, streets and tariffs',
    url: 'https://cont.primariatm.ro/api/mobile/parking',
    out: '../shared/src/data/timpark.json',
  },
  {
    name: 'Official street register',
    url: 'https://servicii.primariatm.ro/api/nomenclator/strazi',
    out: '../shared/src/data/streets.json',
    // Keep only the fields we use, to keep the repository small.
    transform: (raw) => ({
      streets: raw.strazi.map((s) => ({
        id: s.id,
        name: s.denumireCompleta,
        current: s.numeActual,
        previous: s.numeAnterior || null,
        type: s.tipArtera,
        neighbourhood: s.cartier || null,
        status: s.stare,
      })),
    }),
    count: (d) => `${d.streets.length} streets`,
  },
  {
    name: 'City landmarks (tourist guide)',
    url: 'https://cont.primariatm.ro/api/mobile/pois',
    out: '../shared/src/data/pois.json',
    transform: (raw) => ({
      pois: raw.pois.map((p) => ({
        id: p.id,
        name: p.name,
        nameEn: p.nameEn ?? null,
        address: p.address ?? null,
        lat: p.latitude,
        lng: p.longitude,
      })),
    }),
    count: (d) => `${d.pois.length} landmarks`,
  },
  {
    name: 'Neighbourhood outlines',
    url: 'https://cont.primariatm.ro/api/zones',
    out: '../shared/src/data/neighbourhoods.json',
    count: (d) => `${d.features.length} neighbourhoods`,
  },
];

async function snapshot({ name, url, out, transform, count }) {
  console.log(`Fetching ${name}: ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} responded ${res.status} ${res.statusText}`);
  const raw = await res.json();
  const data = transform ? transform(raw) : raw;

  const file = fileURLToPath(new URL(out, import.meta.url));
  mkdirSync(dirname(file), { recursive: true });
  const body = { source: url, fetchedAt: new Date().toISOString(), data };
  writeFileSync(file, JSON.stringify(body) + '\n', 'utf8');
  const summary = count ? count(data) : Array.isArray(data.features) ? `${data.features.length} features` : 'saved';
  console.log(`  ${summary}${data.version ? `, version ${data.version}` : ''} → ${file}`);
}

let failed = false;
for (const source of SOURCES) {
  try {
    await snapshot(source);
  } catch (err) {
    failed = true;
    console.error(`  failed: ${err.message} (the previous snapshot, if any, was kept)`);
  }
}
process.exit(failed ? 1 : 0);
