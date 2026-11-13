// Shared Overpass client for the data scripts.
// Public instances are often at capacity during hackathons; Overpass asks automated clients
// to back off exponentially, which is what this does. Data © OpenStreetMap contributors (ODbL).

export const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/** Bounding box around Timișoara: south, west, north, east. */
export const TIMISOARA_BBOX = [45.7, 21.15, 45.81, 21.31];

const USER_AGENT = 'VLAIQ-UniHack2026-team';

async function tryInstances(query) {
  for (const url of OVERPASS_URLS) {
    console.log(`  querying ${url}…`);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      console.warn(`    failed: ${err.message}${err.cause ? ` (${err.cause.code ?? err.cause.message})` : ''}`);
    }
  }
  return null;
}

/** Runs an Overpass QL query, retrying all instances with exponential backoff (~15 min at most). */
export async function overpass(query) {
  const waits = [0, 30, 60, 120, 240, 480];
  for (const [round, wait] of waits.entries()) {
    if (wait) {
      console.log(`  round ${round + 1}/${waits.length}: waiting ${wait}s before retrying…`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
    const json = await tryInstances(query);
    if (json) return json;
  }
  throw new Error('All Overpass instances failed after backing off — try again later.');
}
