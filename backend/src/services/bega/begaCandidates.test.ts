import { describe, expect, it } from 'vitest';
import { BegaDataset, type BegaRequest } from '../../../../shared/src/schemas/bega';
import { discoverBegaCandidates, eligibleForMode } from './begaCandidates';

// Deliberately synthetic geometry and OSM identities. Never a production Bega snapshot.
const metadata = {
  snapshotVersion: 'synthetic-test-only', extractedAt: '2026-11-14T16:30:00.000Z',
  osmBaseTimestamp: null, source: 'synthetic test fixture', license: 'ODbL-1.0',
  attribution: 'Synthetic fixture; not OSM evidence', bbox: [21, 45.6, 21.5, 45.9],
  limitations: ['Synthetic unit test'], status: 'available', querySha256: '0'.repeat(64),
};
const feature = (id: number, nodeIds: number[], coordinates: [number, number][], tags: Record<string, string> = {}) => ({
  type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {
    osmId: `way/${id}`, osmVersion: 1, osmTimestamp: '2026-11-14T16:30:00.000Z',
    tags: { highway: 'path', foot: 'yes', bicycle: 'yes', ...tags }, nodeIds,
    modes: ['walk', 'cycle'], infrastructure: 'shared_use_path', source: 'Synthetic unit test',
  },
});
const west: [number, number] = [21.2, 45.75], mid: [number, number] = [21.204, 45.75], east: [number, number] = [21.208, 45.75];
const dataset = (features: ReturnType<typeof feature>[]) => BegaDataset.parse({ type: 'FeatureCollection', metadata, features });
const req: BegaRequest = { origin: [21.199, 45.75], destination: [21.209, 45.75], mode: 'walk' };
const policy = { maxCandidates: 2, maxAccessMeters: 1000, maxDistanceRatio: 1.5, minCorridorMeters: 200 };

describe('conservative Bega mode access', () => {
  it.each([
    [{ highway: 'footway', bicycle: 'no' }, 'cycle'],
    [{ highway: 'footway', bicycle: '' }, 'cycle'],
    [{ highway: 'path', bicycle: 'dismount' }, 'cycle'],
    [{ highway: 'cycleway', foot: 'no' }, 'walk'],
    [{ access: 'private', foot: 'yes' }, 'walk'],
    [{ access: 'customers' }, 'cycle'],
    [{ 'bicycle:conditional': 'yes @ (Mo-Fr)' }, 'cycle'],
    [{ oneway: 'yes' }, 'cycle'],
    [{ 'oneway:bicycle': '-1' }, 'cycle'],
    [{ bridge: 'yes' }, 'walk'],
    [{ tunnel: 'yes' }, 'walk'],
    [{ highway: 'residential' }, 'cycle'],
    [{ highway: 'pedestrian' }, 'walk'],
    [{ highway: 'steps' }, 'walk'],
    [{ construction: 'footway' }, 'walk'],
    [{ opening_hours: 'Mo-Fr 08:00-20:00' }, 'walk'],
    [{ area: 'yes' }, 'walk'],
    [{ footway: 'crossing' }, 'walk'],
    [{ footway: 'crossing' }, 'cycle'],
    [{ highway: 'path', foot: '' }, 'walk'],
    [{ 'disused:highway': 'footway' }, 'walk'],
    [{ 'abandoned:highway': 'cycleway' }, 'cycle'],
    [{ demolished: 'yes' }, 'walk'],
  ] as const)('rejects restricted or unknown geometry tags %j for %s', (tags, mode) => {
    const f = dataset([feature(1, [1, 2], [west, east], { ...tags })]).features[0]!;
    expect(eligibleForMode(f, mode)).toBe(false);
  });
  it.each([
    [{ highway: 'footway', foot: 'yes', bicycle: 'designated' }, 'cycle'],
    [{ highway: 'cycleway', foot: 'yes' }, 'walk'],
    [{ highway: 'path', access: 'permissive' }, 'walk'],
    [{ highway: 'cycleway', oneway: 'no' }, 'cycle'],
    [{ highway: 'path', foot: 'official', access: 'public' }, 'walk'],
  ] as const)('accepts allowed tags %j for %s without certifying safety', (tags, mode) => {
    const f = dataset([feature(1, [1, 2], [west, east], { ...tags })]).features[0]!;
    expect(eligibleForMode(f, mode)).toBe(true);
  });
  it('does not expand the dataset modes from tags', () => {
    const f = dataset([feature(1, [1, 2], [west, east])]).features[0]!;
    f.properties.modes = ['walk'];
    expect(eligibleForMode(f, 'cycle')).toBe(false);
  });
});

describe('bounded shared-node candidates', () => {
  it('finds a genuine connected synthetic promenade via a shared original node', () => {
    const d = dataset([feature(1, [1, 2], [west, mid]), feature(2, [2, 3], [mid, east])]);
    const r = discoverBegaCandidates(req, d, 800, policy);
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates[0]!.entry.nodeId).toBe(1);
    expect(r.candidates[0]!.exit.nodeId).toBe(3);
    expect(r.candidates.every((c) => c.networkMeters >= 200)).toBe(true);
  });
  it('does not create connections between nearby but disconnected ways', () => {
    const d = dataset([feature(1, [1, 2], [west, mid]), feature(2, [3, 4], [[21.204001, 45.75], east])]);
    const r = discoverBegaCandidates(req, d, 800, { ...policy, minCorridorMeters: 500 });
    expect(r.candidates).toEqual([]);
  });
  it('does not equate coincident coordinates with shared node identities', () => {
    const d = dataset([feature(1, [1, 2], [west, mid]), feature(2, [3, 4], [mid, east])]);
    expect(discoverBegaCandidates(req, d, 800, { ...policy, minCorridorMeters: 500 }).candidates).toEqual([]);
  });
  it('can join a way at a shared interior OSM node', () => {
    const d = dataset([feature(1, [1, 2, 3], [west, mid, east]), feature(2, [2, 4], [mid, [21.204, 45.754]])]);
    const r = discoverBegaCandidates({ ...req, destination: [21.204, 45.755] }, d, 1200, { ...policy, minCorridorMeters: 650 });
    expect(r.candidates.some((c) => c.entry.nodeId === 1 && c.exit.nodeId === 4)).toBe(true);
  });
  it('rejects geographically unrelated trips before any provider work', () => {
    const d = dataset([feature(1, [1, 2], [west, east])]);
    expect(discoverBegaCandidates({ ...req, origin: [21.45, 45.85], destination: [21.46, 45.85] }, d, 1000, policy).candidates).toEqual([]);
  });
  it('rejects excessive network detour lower bounds', () => {
    const d = dataset([feature(1, [1, 2, 3], [west, [21.204, 45.77], east])]);
    expect(discoverBegaCandidates(req, d, 800, policy).candidates).toEqual([]);
  });
  it('rejects extremely short journeys and same-anchor routes', () => {
    const d = dataset([feature(1, [1, 2], [west, east])]);
    expect(discoverBegaCandidates({ ...req, destination: req.origin }, d, 10, policy).candidates).toEqual([]);
  });
  it('preserves references and has deterministic order independent of feature input order', () => {
    const a = feature(10, [1, 2], [west, mid]), b = feature(2, [2, 3], [mid, east]);
    const first = discoverBegaCandidates(req, dataset([a, b]), 800, policy);
    const second = discoverBegaCandidates(req, dataset([b, a]), 800, policy);
    expect(first.candidates).toEqual(second.candidates);
    expect(first.candidates.flatMap((c) => [c.entry, c.exit]).find((a) => a.nodeId === 2)?.osmIds).toEqual(['way/10', 'way/2']);
  });
  it('bounds candidates and excludes blocked snapshots', () => {
    const d = dataset([feature(1, [1, 2], [west, east])]);
    expect(discoverBegaCandidates(req, d, 800, { ...policy, maxCandidates: 1 }).candidates).toHaveLength(1);
    d.metadata.status = 'blocked';
    expect(discoverBegaCandidates(req, d, 800, policy).candidates).toEqual([]);
  });
  it('rejects unbounded or invalid policy', () => {
    const d = dataset([]);
    expect(() => discoverBegaCandidates(req, d, 800, { ...policy, maxCandidates: 3 })).toThrow(RangeError);
    expect(() => discoverBegaCandidates(req, d, 0, policy)).toThrow(RangeError);
  });
});
