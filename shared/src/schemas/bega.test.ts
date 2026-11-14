import { describe, expect, it } from 'vitest';
import { BegaCoordinate, BegaDataset, BegaRequest, BegaResponse, BegaRoute, type BegaRoute as Route } from './bega';
import { distanceM, type LngLat } from '../geo';

// Synthetic schema fixtures only; no geography or provider outcomes are verified by these tests.
const timestamp = '2026-11-14T16:30:00.000Z';
const origin: LngLat = [21.205, 45.751], entry: LngLat = [21.205, 45.75];
const exit: LngLat = [21.215, 45.75], destination: LngLat = [21.215, 45.751];
function route(from: LngLat, to: LngLat): Route {
  const distanceMeters = distanceM(from, to);
  return { mode: 'walk', geometry: [from, to], distanceMeters, durationSeconds: distanceMeters / 1.4, source: 'Synthetic schema fixture', quality: 'estimated' };
}
function data() {
  return {
    type: 'FeatureCollection',
    metadata: {
      snapshotVersion: 'synthetic-test-only', extractedAt: timestamp, osmBaseTimestamp: timestamp,
      source: 'Synthetic schema fixture', license: 'ODbL-1.0', attribution: 'Synthetic; not OSM evidence',
      bbox: [21, 45.6, 21.5, 45.9], limitations: ['No live evidence'], status: 'available', querySha256: '0'.repeat(64),
    },
    features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [entry, exit] }, properties: {
      osmId: 'way/1', osmVersion: 1, osmTimestamp: timestamp, tags: { highway: 'path', foot: 'yes', bicycle: 'yes' },
      nodeIds: [1, 2], modes: ['walk', 'cycle'], infrastructure: 'shared_use_path', source: 'Synthetic schema fixture',
    } }],
  };
}
function response() {
  const baseline = route(origin, destination);
  const segments = [route(origin, entry), route(entry, exit), route(exit, destination)];
  const distanceMeters = segments.reduce((n, s) => n + s.distanceMeters, 0);
  const durationSeconds = segments.reduce((n, s) => n + s.durationSeconds, 0);
  const corridorMeters = segments[1]!.distanceMeters;
  return {
    status: 'available', baseline, calculatedAt: timestamp, reason: 'synthetic_test', explanation: 'Synthetic fixture only',
    integrity: {
      quality: 'estimated', mappingQuality: 'osm_contributed', measurementQuality: 'derived_geometric_approximation',
      dataSources: ['Synthetic schema fixture'], corridorSnapshotDate: timestamp, corridorSnapshotVersion: 'synthetic-test-only',
      routingProvider: 'Synthetic schema fixture', assumptions: ['Test only'], limitations: ['No live evidence'],
    },
    alternative: {
      mode: 'walk', segments,
      geometry: { type: 'MultiLineString', coordinates: segments.map((s) => s.geometry) },
      source: 'Synthetic schema fixture', quality: 'estimated', distanceMeters, durationSeconds,
      corridorMeters, corridorShare: corridorMeters / distanceMeters, baselineCorridorMeters: 0,
      deltaDistanceMeters: distanceMeters - baseline.distanceMeters, deltaTimeSeconds: durationSeconds - baseline.durationSeconds,
      timeRatio: durationSeconds / baseline.durationSeconds, joinGapsMeters: [0, 0], infrastructureTypes: ['shared_use_path'],
      entry: { nodeId: 1, coordinate: entry, osmIds: ['way/1'] }, exit: { nodeId: 2, coordinate: exit, osmIds: ['way/1'] },
      overlap: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [entry, exit] }, properties: { osmIds: ['way/1'], infrastructureTypes: ['shared_use_path'] } }] },
    },
  };
}

describe('strict Bega request and route contracts', () => {
  it('accepts finite [longitude, latitude] coordinates inside the exact local domain', () => {
    expect(BegaCoordinate.parse([21, 45.6])).toEqual([21, 45.6]);
    expect(BegaCoordinate.parse([21.5, 45.9])).toEqual([21.5, 45.9]);
    expect(BegaRequest.parse({ origin, destination, mode: 'walk' }).mode).toBe('walk');
  });
  it.each([[45.75, 21.205], [20.99, 45.75], [21.51, 45.75], [21.2, 45.59], [21.2, 45.91], [NaN, 45.75], [21.2, Infinity], [21.2, 45.75, 0]])('rejects unsupported coordinate %j', (...point) => {
    expect(BegaCoordinate.safeParse(point).success).toBe(false);
  });
  it.each(['drive', 'car', 'transit', 'wheelchair', ''])('rejects unsupported mode %s', (mode) => {
    expect(BegaRequest.safeParse({ origin, destination, mode }).success).toBe(false);
  });
  it('bounds request detour controls and forbids arbitrary analysis/batch fields', () => {
    expect(BegaRequest.safeParse({ origin, destination, mode: 'cycle', maxTimeRatio: 1.5, maxExtraTimeSeconds: 900 }).success).toBe(true);
    for (const extra of [{ maxTimeRatio: 1.51 }, { maxTimeRatio: 0 }, { maxExtraTimeSeconds: 901 }, { maxExtraTimeSeconds: -1 }, { policy: {} }, { routes: [] }])
      expect(BegaRequest.safeParse({ origin, destination, mode: 'walk', ...extra }).success).toBe(false);
  });
  it('requires actual route geometry, positive finite metrics and source metadata', () => {
    const base = route(origin, destination);
    expect(BegaRoute.safeParse(base).success).toBe(true);
    for (const extra of [{ geometry: [origin] }, { distanceMeters: 0 }, { durationSeconds: 0 }, { distanceMeters: Infinity }, { source: '' }, { quality: 'simulated' }, { mode: 'drive' }])
      expect(BegaRoute.safeParse({ ...base, ...extra }).success).toBe(false);
  });
  it('bounds route vertices and source text', () => {
    expect(BegaRoute.safeParse({ ...route(origin, destination), geometry: Array.from({ length: 12001 }, () => origin) }).success).toBe(false);
    expect(BegaRoute.safeParse({ ...route(origin, destination), source: 'x'.repeat(1001) }).success).toBe(false);
  });
});

describe('corridor provenance and bounded topology contracts', () => {
  it('accepts only the explicitly synthetic complete fixture contract', () => expect(BegaDataset.safeParse(data()).success).toBe(true));
  it('requires source, attribution, license and reproducible query hash', () => {
    const base = data();
    for (const metadata of [
      { ...base.metadata, source: '' }, { ...base.metadata, attribution: '' },
      { ...base.metadata, license: 'unknown' }, { ...base.metadata, querySha256: 'not-a-hash' },
    ]) expect(BegaDataset.safeParse({ ...base, metadata }).success).toBe(false);
  });
  it('supports an honestly blocked empty snapshot without a fabricated upstream timestamp', () => {
    const base = data();
    expect(BegaDataset.safeParse({ ...base, features: [], metadata: { ...base.metadata, status: 'blocked', osmBaseTimestamp: null } }).success).toBe(true);
    expect(BegaDataset.safeParse({ ...base, metadata: { ...base.metadata, status: 'blocked' } }).success).toBe(false);
  });
  it('rejects duplicate mode declarations and infrastructure labels contradicting tags', () => {
    const base = data(); base.features[0]!.properties.modes = ['walk', 'walk'];
    expect(BegaDataset.safeParse(base).success).toBe(false);
    const labelled = data(); labelled.features[0]!.properties.infrastructure = 'cycling_path';
    expect(BegaDataset.safeParse(labelled).success).toBe(false);
  });
  it('rejects incomplete original OSM node identities', () => {
    const base = data(); base.features[0]!.properties.nodeIds = [1];
    expect(BegaDataset.safeParse(base).success).toBe(false);
  });
  it('rejects duplicate OSM way identities and conflicting node coordinates', () => {
    const base = data(); base.features.push(structuredClone(base.features[0]!));
    expect(BegaDataset.safeParse(base).success).toBe(false);
    base.features[1]!.properties.osmId = 'way/2';
    base.features[1]!.geometry.coordinates[0] = [21.206, 45.75];
    expect(BegaDataset.safeParse(base).success).toBe(false);
  });
  it('rejects geometry outside the declared extraction bounds', () => {
    const base = data(); base.metadata.bbox = [21.21, 45.74, 21.22, 45.76];
    expect(BegaDataset.safeParse(base).success).toBe(false);
  });
  it('rejects a non-local or reversed extraction bounding box', () => {
    const base = data();
    for (const bbox of [[20, 45.6, 21.5, 45.9], [21.5, 45.6, 21, 45.9], [21, 45.9, 21.5, 45.6]])
      expect(BegaDataset.safeParse({ ...base, metadata: { ...base.metadata, bbox } }).success).toBe(false);
  });
  it('bounds production feature counts before graph construction', () => {
    const base = data();
    base.features = Array.from({ length: 401 }, (_, i) => ({ ...structuredClone(base.features[0]!), properties: { ...base.features[0]!.properties, osmId: `way/${i + 1}` } }));
    expect(BegaDataset.safeParse(base).success).toBe(false);
  });
});

describe('Bega comparison response invariants', () => {
  it('validates the complete available comparison', () => expect(BegaResponse.safeParse(response()).success).toBe(true));
  it.each(['deltaDistanceMeters', 'deltaTimeSeconds', 'timeRatio', 'corridorShare', 'distanceMeters', 'durationSeconds'] as const)('rejects an inconsistent %s', (key) => {
    const base = response(); base.alternative[key] += 0.01;
    expect(BegaResponse.safeParse(base).success).toBe(false);
  });
  it('rejects an alternative whose geometry differs from provider segments', () => {
    const base = response(); base.alternative.geometry.coordinates = structuredClone(base.alternative.geometry.coordinates);
    base.alternative.geometry.coordinates[0]![0] = [21.206, 45.751];
    expect(BegaResponse.safeParse(base).success).toBe(false);
  });
  it('rejects driving or mismatched active mode labels', () => {
    const base = response(); base.alternative.mode = 'cycle';
    expect(BegaResponse.safeParse(base).success).toBe(false);
    base.alternative.mode = 'walk'; base.alternative.segments[0]!.mode = 'cycle';
    expect(BegaResponse.safeParse(base).success).toBe(false);
  });
  it('rejects zero-denominator and inflated overlap', () => {
    const base = response(); base.baseline.durationSeconds = 0;
    expect(BegaResponse.safeParse(base).success).toBe(false);
    const inflated = response(); inflated.alternative.corridorMeters = inflated.alternative.distanceMeters + 1;
    inflated.alternative.corridorShare = inflated.alternative.corridorMeters / inflated.alternative.distanceMeters;
    expect(BegaResponse.safeParse(inflated).success).toBe(false);
  });
  it('supports negative deltas while keeping exact formulas', () => {
    const base = response(); base.baseline.durationSeconds *= 2; base.baseline.distanceMeters *= 2;
    base.alternative.deltaDistanceMeters = base.alternative.distanceMeters - base.baseline.distanceMeters;
    base.alternative.deltaTimeSeconds = base.alternative.durationSeconds - base.baseline.durationSeconds;
    base.alternative.timeRatio = base.alternative.durationSeconds / base.baseline.durationSeconds;
    expect(base.alternative.deltaTimeSeconds).toBeLessThan(0);
    expect(BegaResponse.safeParse(base).success).toBe(true);
  });
  it('available requires baseline and a sourced overlap geometry', () => {
    const base = response();
    expect(BegaResponse.safeParse({ ...base, baseline: null }).success).toBe(false);
    base.alternative.overlap.features = [];
    expect(BegaResponse.safeParse(base).success).toBe(false);
  });
  it.each(['not_relevant', 'no_valid_alternative', 'provider_unavailable', 'data_unavailable'])('allows honest %s without an invented alternative', (status) => {
    const base = response();
    expect(BegaResponse.safeParse({ ...base, status, baseline: null, alternative: null }).success).toBe(true);
    expect(BegaResponse.safeParse({ ...base, status }).success).toBe(false);
  });
  it('forbids unsupported environmental or safety measurements', () => {
    const base = response();
    expect(BegaResponse.safeParse({ ...base, pollutionReductionPercent: 42 }).success).toBe(false);
    expect(BegaResponse.safeParse({ ...base, alternative: { ...base.alternative, safetyScore: 100 } }).success).toBe(false);
  });
});
