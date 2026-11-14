// Saves the real routes of the DEMO scenario (Timișoara Nord → Piața Victoriei, spec §6.8) so the demo
// still runs when the routing provider is down. It asks the RUNNING local backend (`pnpm dev`), so the
// routes go through exactly the same parsing and providers as in the app. Nothing here is invented:
// a pair that the provider cannot route is skipped, never drawn as a straight line.
//
//   pnpm data:demo-routes            (backend on http://localhost:8787)
//   BACKEND_URL=http://host:port pnpm data:demo-routes
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BACKEND = (process.env.BACKEND_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const OUT = fileURLToPath(new URL('../shared/src/data/demo-routes.json', import.meta.url));
// Same records as the "Încearcă DEMO" button (frontend/src/app/App.tsx).
const ORIGIN_ID = 'place-osm-node-9322434969';
const DESTINATION_ID = 'street-11784';
const MODES = ['balanced', 'cheap', 'less_walk'];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, body) {
  const res = await fetch(`${BACKEND}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(40000),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

/** Next Monday–Friday at 10:00 Bucharest time, like the DEMO button (Timpark charges then). */
function nextWeekdayAt10() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  // 10:00 in Europe/Bucharest is 08:00 UTC in winter (EET) and 07:00 in summer (EEST).
  const offset = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Bucharest', timeZoneName: 'shortOffset' })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName')?.value.match(/GMT\+(\d+)/)?.[1];
  d.setUTCHours(10 - Number(offset ?? 2), 0, 0, 0);
  return d.toISOString();
}

const { destinations } = await call('/api/destinations');
const find = (id) => destinations.find((d) => d.id === id && d.location);
const from = find(ORIGIN_ID);
const to = find(DESTINATION_ID);
if (!from || !to) throw new Error('DEMO places are missing from the snapshots. Run `pnpm data:city` first.');
const origin = [from.location.lng, from.location.lat];
const destination = [to.location.lng, to.location.lat];
const arriveAt = nextWeekdayAt10();

const parkings = new Map();
for (const mode of MODES) {
  for (const maxWalkMinutes of [12, 20]) {
    const reco = await call('/api/recommendations', { destination, origin, arriveAt, mode, maxWalkMinutes });
    for (const o of reco.options) parkings.set(o.id, { name: o.name, coordinate: o.coordinate });
  }
}
console.log(`DEMO: ${from.name} → ${to.name}, ${parkings.size} recommended parkings`);

const driving = [];
const walking = [];
const offline = (source) => /copie salvată/i.test(source);
for (const [id, p] of parkings) {
  try {
    const set = await call('/api/navigation/routes', { origin, destination: p.coordinate });
    if (set.offline || set.routes.some((r) => offline(r.source))) throw new Error('got a saved copy, not a live route');
    driving.push({ origin, destination: p.coordinate, routes: set.routes });
  } catch (e) {
    console.warn(`  drive to ${p.name} (${id}) skipped: ${e.message}`);
  }
  await pause(1200); // the keyless providers are shared public servers
  try {
    const result = await call('/api/journeys/complete', { origin: p.coordinate, destination, modes: ['walk'] });
    const leg = result.journeys.find((j) => j.category === 'walk')?.legs[0];
    if (!leg?.route || offline(leg.route.source)) throw new Error('no live walking route');
    walking.push({ origin: p.coordinate, destination, route: leg.route });
  } catch (e) {
    console.warn(`  walk from ${p.name} (${id}) skipped: ${e.message}`);
  }
  await pause(1200);
}

const snapshot = {
  version: 1,
  savedAt: new Date().toISOString(),
  note:
    'Rute reale salvate de la furnizorii de rutare (OSRM / FOSSGIS / openrouteservice, date OpenStreetMap) pentru scenariul DEMO. Folosite doar când furnizorul nu răspunde.',
  scenario: {
    origin: { name: from.name, coordinate: origin },
    destination: { name: to.name, coordinate: destination },
  },
  driving,
  walking,
};
writeFileSync(OUT, JSON.stringify(snapshot) + '\n');
console.log(`Saved ${driving.length} driving and ${walking.length} walking routes to shared/src/data/demo-routes.json`);
