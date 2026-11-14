/** All geometry/identities below are SYNTHETIC TEST FIXTURES, not observed Bega data. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BBOX, ENDPOINT, QUERY, buildSnapshot, eligibleModes } from './fetch-bega-corridor.mjs';

const at = '2026-11-14T10:00:00Z';
const way = (id, tags, coordinates, nodeIds) => ({
  type: 'way', id, version: 2, timestamp: at, tags,
  nodes: nodeIds,
  geometry: coordinates.map(([lon, lat]) => ({ lon, lat })),
});
const water = () => way(1, { waterway: 'canal', name: 'Bega' }, [[21.21, 45.75], [21.22, 45.75]], [1, 2]);
const path = (tags = { highway: 'cycleway', foot: 'yes' }) => way(2, tags, [[21.21, 45.7502], [21.22, 45.7502]], [3, 4]);
const raw = (...paths) => ({ osm3s: { timestamp_osm_base: at }, elements: [water(), ...paths] });
const convert = (...paths) => buildSnapshot(raw(...paths), at);

test('converter preserves original OSM vertices, node identities and source provenance', () => {
  const input = path();
  const result = convert(input);
  const f = result.features[0];
  assert.equal(result.type, 'FeatureCollection');
  assert.deepEqual(f.geometry.coordinates, [[21.21, 45.7502], [21.22, 45.7502]]);
  assert.deepEqual(f.properties.nodeIds, input.nodes);
  assert.equal(f.properties.osmId, 'way/2');
  assert.equal(f.properties.osmVersion, 2);
  assert.equal(f.properties.osmTimestamp, at);
  assert.equal(f.properties.source, 'https://www.openstreetmap.org/way/2/history');
  assert.equal(result.metadata.osmBaseTimestamp, at);
  assert.equal(result.metadata.extractedAt, at);
  assert.equal(result.metadata.source, ENDPOINT);
  assert.deepEqual(result.metadata.bbox, BBOX);
});

test('converter is deterministic for the same snapshot and extraction timestamp', () => {
  const input = raw(path());
  assert.deepEqual(buildSnapshot(input, at), buildSnapshot(structuredClone(input), at));
});

test('classification separates shared use, cycling and pedestrian permission', () => {
  assert.deepEqual(convert(path()).features[0].properties.modes, ['walk', 'cycle']);
  assert.equal(convert(path()).features[0].properties.infrastructure, 'shared_use_path');
  assert.equal(convert(path({ highway: 'cycleway' })).features[0].properties.infrastructure, 'cycling_path');
  assert.equal(convert(path({ highway: 'footway', bicycle: 'no' })).features[0].properties.infrastructure, 'pedestrian_path');
  assert.equal(convert(path({ highway: 'path', bicycle: 'yes' })).features[0].properties.infrastructure, 'unknown');
});

test('untagged paths and pedestrian streets cannot become mapped corridor infrastructure', () => {
  assert.deepEqual(eligibleModes({ highway: 'path' }), []);
  assert.deepEqual(eligibleModes({ highway: 'pedestrian', bicycle: 'yes', foot: 'yes' }), []);
  assert.deepEqual(eligibleModes({ highway: 'residential', bicycle: 'yes', foot: 'yes' }), []);
});

test('dismount and unknown mode permissions cannot enable cycling', () => {
  assert.deepEqual(eligibleModes({ highway: 'footway', bicycle: 'dismount' }), ['walk']);
  assert.deepEqual(eligibleModes({ highway: 'cycleway', bicycle: 'use_sidepath' }), []);
  assert.deepEqual(eligibleModes({ highway: 'cycleway', foot: 'unknown' }), ['cycle']);
  assert.deepEqual(eligibleModes({ highway: 'path', bicycle: 'official', foot: 'official' }), ['walk', 'cycle']);
});

test('general restricted access takes precedence in this conservative snapshot', () => {
  for (const access of ['private', 'no', 'customers', 'destination', 'permit', 'unknown']) {
    assert.deepEqual(eligibleModes({ highway: 'cycleway', access, bicycle: 'yes' }), []);
  }
});

test('bridge, tunnel, area and crossing ways are excluded', () => {
  for (const tags of [{ bridge: 'yes' }, { tunnel: 'yes' }, { area: 'yes' }, { footway: 'crossing' }]) {
    assert.deepEqual(eligibleModes({ highway: 'footway', ...tags }), []);
  }
});

test('conditional, lifecycle, opening-hours and any directional rules fail closed', () => {
  for (const tags of [
    { 'foot:conditional': 'yes @ (daylight)' }, { construction: 'no' }, { 'abandoned:highway': 'cycleway' },
    { proposed: 'cycleway' }, { disused: 'yes' }, { demolished: 'yes' }, { 'razed:highway': 'cycleway' },
    { opening_hours: 'sunrise-sunset' }, { oneway: 'yes' }, { 'oneway:bicycle': '-1' }, { 'oneway:weird': 'yes' },
  ]) assert.deepEqual(eligibleModes({ highway: 'cycleway', ...tags }), []);
  assert.deepEqual(eligibleModes({ highway: 'cycleway', opening_hours: '24/7', oneway: 'no' }), ['cycle']);
});

test('crossing-only path geometry is excluded even when bridge tag is absent', () => {
  const crossing = way(3, { highway: 'footway' }, [[21.215, 45.7498], [21.215, 45.7502]], [5, 6]);
  assert.throws(() => convert(crossing), /NO_ELIGIBLE_CORRIDOR/);
});

test('parallel roads outside the corridor tolerance and canal centerline artifacts are excluded', () => {
  const distant = way(3, { highway: 'footway' }, [[21.211, 45.752], [21.219, 45.752]], [5, 6]);
  const inWater = way(4, { highway: 'footway' }, [[21.211, 45.75], [21.219, 45.75]], [7, 8]);
  assert.throws(() => convert(distant, inWater), /NO_ELIGIBLE_CORRIDOR/);
});

test('bbox filtering keeps original nodes without invented clipped endpoints', () => {
  const input = way(3, { highway: 'footway' }, [[21.17, 45.7502], [21.211, 45.7502], [21.219, 45.7502]], [5, 6, 7]);
  const result = convert(input).features[0];
  assert.deepEqual(result.geometry.coordinates, [[21.211, 45.7502], [21.219, 45.7502]]);
  assert.deepEqual(result.properties.nodeIds, [6, 7]);
});

test('disconnected fragments are not joined; longest original-node fragment wins', () => {
  const input = way(3, { highway: 'footway' }, [
    [21.21, 45.7502], [21.212, 45.7502], [21.213, 45.752], [21.214, 45.7502], [21.219, 45.7502],
  ], [5, 6, 7, 8, 9]);
  const result = convert(input).features[0];
  assert.deepEqual(result.geometry.coordinates, [[21.214, 45.7502], [21.219, 45.7502]]);
  assert.deepEqual(result.properties.nodeIds, [8, 9]);
});

test('duplicate OSM way identities are rejected', () => {
  assert.throws(() => convert(path(), path()), /DUPLICATE_OSM_WAY/);
});

test('missing timestamps and partial Overpass responses are rejected', () => {
  assert.throws(() => buildSnapshot({ elements: [] }, at), /MISSING_OSM_SNAPSHOT/);
  assert.throws(() => buildSnapshot({ ...raw(path()), remark: 'runtime error: timeout' }, at), /INVALID_OR_PARTIAL/);
  assert.throws(() => buildSnapshot({ ...raw(path()), elements: [] }, at), /NO_BEGA_WATERWAY/);
});

test('invalid way provenance or unmatched node geometry is rejected', () => {
  const invalid = path();
  delete invalid.version;
  assert.throws(() => convert(invalid), /MISSING_OSM_WAY_PROVENANCE/);
  const unmatched = path();
  unmatched.nodes.pop();
  assert.throws(() => convert(unmatched), /INVALID_OSM_NODE_GEOMETRY/);
});

test('element and coordinate budgets reject oversized replay input before geometry processing', () => {
  assert.throws(() => buildSnapshot({ ...raw(), elements: Array(3001).fill({}) }, at), /INVALID_OR_PARTIAL/);
  assert.throws(() => buildSnapshot({ ...raw(), elements: [{ geometry: Array(20001).fill({ lat: 0, lon: 0 }) }] }, at), /RAW_COORDINATE_BUDGET/);
});

test('invalid tag payloads fail rather than silently dropping provenance', () => {
  assert.throws(() => convert(path({ highway: 'cycleway', name: 123 })), /INVALID_OSM_TAGS/);
  assert.throws(() => convert(path({ highway: 'cycleway', name: 'x'.repeat(1001) })), /INVALID_OSM_TAGS/);
});

test('committed snapshot records exact extraction query hash and honest blocked state', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../shared/src/data/bega-corridor.json', import.meta.url), 'utf8'));
  assert.equal(snapshot.metadata.querySha256, createHash('sha256').update(QUERY).digest('hex'));
  assert.equal(snapshot.metadata.license, 'ODbL-1.0');
  assert.match(snapshot.metadata.attribution, /OpenStreetMap contributors/);
  if (snapshot.metadata.status === 'blocked') {
    assert.deepEqual(snapshot.features, []);
    assert.equal(snapshot.metadata.osmBaseTimestamp, null);
    assert.match(snapshot.metadata.limitations.join(' '), /BLOCKED/);
  }
});
