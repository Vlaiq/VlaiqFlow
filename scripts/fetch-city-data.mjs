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
];

async function snapshot({ name, url, out }) {
  console.log(`Fetching ${name}: ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} responded ${res.status} ${res.statusText}`);
  const data = await res.json();

  const file = fileURLToPath(new URL(out, import.meta.url));
  mkdirSync(dirname(file), { recursive: true });
  const body = { source: url, fetchedAt: new Date().toISOString(), data };
  writeFileSync(file, JSON.stringify(body) + '\n', 'utf8');
  const count = Array.isArray(data.features) ? `${data.features.length} features` : 'saved';
  console.log(`  ${count}, version ${data.version ?? 'n/a'} → ${file}`);
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
