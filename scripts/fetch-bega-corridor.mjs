/**
 * Explicit, one-shot Bega extraction. Never runs in a user request.
 * Usage: NODE_USE_ENV_PROXY=1 node scripts/fetch-bega-corridor.mjs --fetch
 * Replay: node scripts/fetch-bega-corridor.mjs --input work/bega-overpass.json
 * Data © OpenStreetMap contributors, ODbL 1.0. No third-party code copied.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ENDPOINT = 'https://overpass-api.de/api/interpreter';
export const BBOX = [21.175, 45.735, 21.255, 45.765]; // GeoJSON west,south,east,north
const [west, south, east, north] = BBOX;
export const QUERY = `[out:json][timeout:30][maxsize:16777216];
way["waterway"~"^(river|canal)$"]["name"~"Bega",i](${south},${west},${north},${east})->.bega;
way(around.bega:65)["highway"~"^(footway|cycleway|path)$"](${south},${west},${north},${east})->.paths;
(.bega;.paths;);
out meta geom;`;
const QUERY_HASH = createHash('sha256').update(QUERY).digest('hex');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = resolve(ROOT, 'shared/src/data/bega-corridor.json');
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FEATURES = 400;
const MAX_COORDINATES = 12000;
const ALLOW = new Set(['yes', 'designated', 'permissive', 'official']);
const LIFECYCLE = ['construction', 'proposed', 'abandoned', 'disused', 'demolished', 'razed'];
const LIMITATIONS = [
  'OpenStreetMap contributor mapping; no municipal endorsement or field inspection.',
  'Partial Iosefin–Regina Maria coverage; missing ways are not evidence of absent infrastructure.',
  'Only original OSM node-to-node geometry retained. No artificial connectors or geometric snapping.',
  'At most one longest qualifying contiguous fragment per OSM way retained; other fragments omitted conservatively.',
  'All mapped bridges, tunnels, restricted, conditional, and directed ways excluded conservatively.',
  'Riverside association is a bounded map-based approximation, not evidence of air quality, safety, lighting or accessibility.',
  'No OSM node barrier or turn-restriction analysis. The routing provider must establish current network connectivity.',
];

export function eligibleModes(tags) {
  if (!['footway', 'cycleway', 'path'].includes(tags.highway)) return [];
  if (tags.bridge && tags.bridge !== 'no' || tags.tunnel && tags.tunnel !== 'no') return [];
  if (Object.keys(tags).some(key => key.includes('conditional') || LIFECYCLE.some(prefix => key === prefix || key.startsWith(`${prefix}:`)))) return [];
  if (Object.entries(tags).some(([key, value]) => (key === 'oneway' || key.startsWith('oneway:')) && !['no', '0', 'false'].includes(value))) return [];
  if (tags.opening_hours && tags.opening_hours !== '24/7') return [];
  // Conservative fail-closed policy: explicit public mode access does not override a
  // general restricted-access way in this snapshot.
  if (tags.access && !ALLOW.has(tags.access) && tags.access !== 'public') return [];
  if (tags.area === 'yes' || tags.footway === 'crossing') return [];
  const walk = (tags.foot === undefined || ALLOW.has(tags.foot)) && (ALLOW.has(tags.foot) || tags.highway === 'footway');
  const cycle = (tags.bicycle === undefined || ALLOW.has(tags.bicycle)) && (ALLOW.has(tags.bicycle) || tags.highway === 'cycleway');
  return [...(walk ? ['walk'] : []), ...(cycle ? ['cycle'] : [])];
}

const R = 6371000 * Math.PI / 180;
const COS = Math.cos(45.75 * Math.PI / 180);
const xy = ([lng, lat]) => [(lng - 21.215) * R * COS, (lat - 45.75) * R];
const validCoordinate = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= west && p[0] <= east && p[1] >= south && p[1] <= north;

function closestSegment(point, segments) {
  let best = { distance: Infinity, tangent: [0, 0] };
  for (const [a, b] of segments) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const squared = dx * dx + dy * dy;
    if (!squared) continue;
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / squared));
    const distance = Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
    if (distance < best.distance) best = { distance, tangent: [dx / Math.sqrt(squared), dy / Math.sqrt(squared)] };
  }
  return best;
}

/** Pure converter; raw source and original OSM node IDs are authoritative. */
export function buildSnapshot(raw, extractedAt = new Date().toISOString()) {
  if (!raw || !Array.isArray(raw.elements) || raw.elements.length > 3000 || raw.remark) throw new Error('INVALID_OR_PARTIAL_OVERPASS_RESPONSE');
  if (raw.elements.reduce((sum, el) => sum + (el.geometry?.length ?? 0), 0) > 20000) throw new Error('RAW_COORDINATE_BUDGET_EXCEEDED');
  if (!raw.osm3s?.timestamp_osm_base || !Number.isFinite(Date.parse(raw.osm3s.timestamp_osm_base))) throw new Error('MISSING_OSM_SNAPSHOT_TIMESTAMP');
  const water = raw.elements.filter(el => el.type === 'way' && ['river', 'canal'].includes(el.tags?.waterway) && /bega/i.test(el.tags?.name ?? ''));
  if (!water.length) throw new Error('NO_BEGA_WATERWAY');
  const segments = [];
  for (const way of water) {
    const coordinates = way.geometry?.map(p => [p.lon, p.lat]) ?? [];
    for (let i = 1; i < coordinates.length; i++) {
      if (validCoordinate(coordinates[i - 1]) && validCoordinate(coordinates[i])) segments.push([xy(coordinates[i - 1]), xy(coordinates[i])]);
    }
  }
  if (!segments.length || segments.length > 3000) throw new Error('INVALID_WATERWAY_GEOMETRY_BUDGET');
  const features = [];
  let totalCoordinates = 0;
  const seen = new Set();
  for (const way of [...raw.elements].sort((a, b) => a.id - b.id)) {
    const modes = eligibleModes(way.tags ?? {});
    if (!modes.length || way.type !== 'way') continue;
    if (!Number.isSafeInteger(way.id) || way.id <= 0 || !Number.isSafeInteger(way.version) || way.version <= 0 || !way.timestamp || !Number.isFinite(Date.parse(way.timestamp))) throw new Error('MISSING_OSM_WAY_PROVENANCE');
    if (seen.has(way.id)) throw new Error('DUPLICATE_OSM_WAY');
    seen.add(way.id);
    if (Object.keys(way.tags).length > 100 || Object.values(way.tags).some(value => typeof value !== 'string' || value.length > 1000)) throw new Error('INVALID_OSM_TAGS');
    const coordinates = way.geometry?.map(p => [p.lon, p.lat]) ?? [];
    if (coordinates.length !== way.nodes?.length || coordinates.length < 2 || coordinates.length > 2000 || !way.nodes.every(id => Number.isSafeInteger(id) && id > 0)) throw new Error('INVALID_OSM_NODE_GEOMETRY');
    const keep = [];
    for (let i = 1; i < coordinates.length; i++) {
      const from = coordinates[i - 1], to = coordinates[i];
      if (!validCoordinate(from) || !validCoordinate(to)) { keep.push(false); continue; }
      const a = xy(from), b = xy(to), length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const near = closestSegment([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], segments);
      const alignment = length ? Math.abs(((b[0] - a[0]) * near.tangent[0] + (b[1] - a[1]) * near.tangent[1]) / length) : 0;
      // Both vertices AND midpoint must lie within the waterway buffer. Alignment
      // rejects crossing-only approaches; 6m exclusion avoids centerline artifacts.
      keep.push(length > 0 && closestSegment(a, segments).distance <= 65 && closestSegment(b, segments).distance <= 65 && near.distance <= 65 && near.distance >= 6 && alignment >= Math.SQRT1_2);
    }
    let bestFragment = null;
    for (let start = 0; start < keep.length;) {
      if (!keep[start]) { start++; continue; }
      let end = start;
      while (keep[end + 1]) end++;
      const fragment = coordinates.slice(start, end + 2);
      const nodeIds = way.nodes.slice(start, end + 2);
      const length = fragment.slice(1).reduce((sum, point, i) => {
        const a = xy(fragment[i]), b = xy(point);
        return sum + Math.hypot(b[0] - a[0], b[1] - a[1]);
      }, 0);
      if (!bestFragment || length > bestFragment.length) bestFragment = { fragment, nodeIds, length };
      start = end + 1;
    }
    if (bestFragment) {
      const { fragment, nodeIds } = bestFragment;
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: fragment },
        properties: {
          osmId: `way/${way.id}`,
          osmVersion: way.version,
          osmTimestamp: way.timestamp,
          tags: Object.fromEntries(Object.entries(way.tags).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
          nodeIds,
          modes,
          infrastructure: modes.length === 2 ? 'shared_use_path' : way.tags.highway === 'cycleway' ? 'cycling_path' : way.tags.highway === 'footway' ? 'pedestrian_path' : 'unknown',
          source: `https://www.openstreetmap.org/way/${way.id}/history`,
        },
      });
      totalCoordinates += fragment.length;
      if (features.length > MAX_FEATURES || totalCoordinates > MAX_COORDINATES) throw new Error('DATASET_GEOMETRY_BUDGET_EXCEEDED');
    }
  }
  if (!features.length) throw new Error('NO_ELIGIBLE_CORRIDOR_INFRASTRUCTURE');
  return {
    type: 'FeatureCollection',
    metadata: {
      snapshotVersion: 'bega-osm-v1',
      extractedAt,
      osmBaseTimestamp: raw.osm3s.timestamp_osm_base,
      source: ENDPOINT,
      license: 'ODbL-1.0',
      attribution: '© OpenStreetMap contributors',
      bbox: BBOX,
      limitations: LIMITATIONS,
      status: 'available',
      querySha256: QUERY_HASH,
    },
    features,
  };
}

async function readBoundedResponse(response) {
  if (!response.ok) throw new Error(`OVERPASS_HTTP_${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('EMPTY_OVERPASS_BODY');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('OVERPASS_RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const args = process.argv.slice(2);
  let rawText;
  if (args.length === 1 && args[0] === '--fetch') {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'VLAIQ-UniHack2026-BegaData/1.0 (one-shot research snapshot)' },
      body: new URLSearchParams({ data: QUERY }),
      signal: AbortSignal.timeout(45000),
    });
    rawText = await readBoundedResponse(response);
    const rawPath = resolve(ROOT, 'work/bega-overpass.json');
    await mkdir(dirname(rawPath), { recursive: true });
    await writeFile(rawPath, rawText, { mode: 0o600 });
  } else if (args.length === 2 && args[0] === '--input') {
    // This is an explicit local-file replay, never arbitrary remote URL fetching.
    const { stat } = await import('node:fs/promises');
    const input = resolve(args[1]);
    if ((await stat(input)).size > MAX_BYTES) throw new Error('OVERPASS_RESPONSE_TOO_LARGE');
    rawText = await readFile(input, 'utf8');
  } else throw new Error('Usage: node scripts/fetch-bega-corridor.mjs --fetch | --input <raw-overpass.json>');
  const snapshot = buildSnapshot(JSON.parse(rawText));
  await mkdir(dirname(OUT), { recursive: true });
  const temporary = `${OUT}.tmp`;
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`);
  await rename(temporary, OUT); // A failed request/conversion never destroys a valid snapshot.
  console.log(`Bega snapshot: ${snapshot.features.length} mapped fragments; ${snapshot.metadata.osmBaseTimestamp}; ${OUT}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    if (error.cause?.code) console.error(`Cause: ${String(error.cause.code).slice(0, 100)}`);
    process.exitCode = 1;
  });
}
