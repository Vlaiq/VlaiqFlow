import { describe, expect, it } from 'vitest';
import { distanceM } from '../../../../shared/src/geo';
import {
  boundsIntersect, isLocalCoordinate, lineBounds, lineLengthMeters,
  measureCorridorOverlap, nearestOnLine,
  type Coordinate, type CorridorLine,
} from './begaGeometry';

// Deliberately synthetic local metric fixtures; these are not real Bega infrastructure.
const scale = 6371000 * Math.PI / 180;
function point(x: number, y = 0): Coordinate {
  return [21.2 + x / (scale * Math.cos(45.75 * Math.PI / 180)), 45.75 + y / scale];
}
function line(id: string, from: Coordinate, to: Coordinate, infrastructure = 'pedestrian_path'): CorridorLine {
  return { id, coordinates: [from, to], infrastructure };
}
const east: Coordinate[] = [point(0), point(100)];
const corridor = [line('synthetic/1', point(0), point(100))];

describe('Bega local geometry (synthetic fixtures)', () => {
  it('accepts longitude/latitude and rejects reversed coordinates', () => {
    expect(isLocalCoordinate([21.2, 45.75])).toBe(true);
    expect(isLocalCoordinate([45.75, 21.2])).toBe(false);
    expect(isLocalCoordinate([21.2, NaN])).toBe(false);
    expect(isLocalCoordinate([21.2, 45.75, 2])).toBe(false);
  });
  it('rejects global coordinates outside the projection domain', () => {
    expect(isLocalCoordinate([0, 0])).toBe(false);
    expect(measureCorridorOverlap([[0, 0], [0.01, 0]], corridor)).toBeNull();
  });
  it('uses shared spherical distance and keeps metre units', () => {
    expect(lineLengthMeters(east)).toBeCloseTo(100, 6);
    expect(lineLengthMeters([point(0), point(50), point(100)])).toBeCloseTo(100, 6);
    expect(lineLengthMeters([point(0), point(0)])).toBe(0);
  });
  it('projects to an actual line location rather than just the nearest vertex', () => {
    const closest = nearestOnLine(point(40, 20), east);
    expect(closest.distanceMeters).toBeCloseTo(20, 4);
    expect(closest.fraction).toBeCloseTo(0.4, 8);
    expect(distanceM(closest.point, point(40))).toBeLessThan(1e-6);
  });
  it('clamps a projection at a mapped endpoint', () => {
    const closest = nearestOnLine(point(120), east);
    expect(closest.fraction).toBe(1);
    expect(closest.distanceMeters).toBeCloseTo(20, 5);
  });
  it('handles a duplicate line vertex without dividing by zero', () => {
    const closest = nearestOnLine(point(30, 10), [point(0), point(0), point(100)]);
    expect(closest.segmentIndex).toBe(1);
    expect(closest.distanceMeters).toBeCloseTo(10, 4);
  });
  it('rejects empty or invalid nearest-point geometry', () => {
    expect(() => nearestOnLine(point(0), [])).toThrow('INVALID_LOCAL_GEOMETRY');
    expect(() => nearestOnLine([45.75, 21.2], east)).toThrow('INVALID_LOCAL_GEOMETRY');
  });
  it('computes bounds and applies metric padding', () => {
    const a = lineBounds(east), b = lineBounds([point(0, 10), point(100, 10)]);
    expect(boundsIntersect(a, b)).toBe(false);
    expect(boundsIntersect(a, b, 11)).toBe(true);
    expect(() => lineBounds([])).toThrow('EMPTY_GEOMETRY');
  });
  it('measures continuous full overlap between sparse endpoints', () => {
    const result = measureCorridorOverlap(east, corridor)!;
    expect(result.overlapMeters).toBeCloseTo(100, 6);
    expect(result.geometryMeters).toBeCloseTo(100, 6);
    expect(result.featureIds).toEqual(['synthetic/1']);
    expect(result.infrastructureTypes).toEqual(['pedestrian_path']);
    expect(result.parts.length).toBeGreaterThan(0);
  });
  it('finds interior overlap that vertex-only sampling would miss', () => {
    const result = measureCorridorOverlap([point(-100), point(200)], corridor)!;
    expect(result.overlapMeters).toBeCloseTo(112, 5);
    expect(result.overlapMeters).toBeLessThan(result.geometryMeters);
  });
  it('ignores perpendicular bridge-only crossings', () => {
    const result = measureCorridorOverlap([point(50, -100), point(50, 100)], corridor)!;
    expect(result.overlapMeters).toBe(0);
    expect(result.parts).toEqual([]);
  });
  it('ignores wrong-bank or parallel street geometry beyond tolerance', () => {
    expect(measureCorridorOverlap([point(0, 25), point(100, 25)], corridor)!.overlapMeters).toBe(0);
    expect(measureCorridorOverlap([point(0, 6.1), point(100, 6.1)], corridor)!.overlapMeters).toBe(0);
  });
  it('allows documented small map alignment offsets', () => {
    expect(measureCorridorOverlap([point(0, 3), point(100, 3)], corridor)!.overlapMeters).toBeCloseTo(100, 3);
  });
  it('unions duplicate and reversed OSM geometry without double counting', () => {
    const duplicate = [corridor[0]!, line('synthetic/2', point(100), point(0))];
    const result = measureCorridorOverlap(east, duplicate)!;
    expect(result.overlapMeters).toBeCloseTo(100, 6);
    expect(result.featureIds).toEqual(['synthetic/1', 'synthetic/2']);
  });
  it('does not silently fill disconnected gaps', () => {
    const result = measureCorridorOverlap([point(0), point(300)], [
      line('synthetic/1', point(0), point(50)),
      line('synthetic/2', point(250), point(300)),
    ])!;
    expect(result.overlapMeters).toBeCloseTo(112, 5);
    expect(result.parts.every(part => distanceM(...part.coordinates) <= 56.001)).toBe(true);
  });
  it('clips highlighting to provider geometry with contributing references', () => {
    const result = measureCorridorOverlap(east, [
      line('a', point(0), point(40), 'pedestrian_path'),
      line('b', point(60), point(100), 'shared_use_path'),
    ])!;
    for (const part of result.parts) {
      expect(part.coordinates[0][1]).toBe(east[0]![1]);
      expect(part.coordinates[1][1]).toBe(east[1]![1]);
      expect(part.featureIds.length).toBeGreaterThan(0);
      if (part.coordinates[1][0] < point(50)[0]) expect(part.featureIds).toEqual(['a']);
      if (part.coordinates[0][0] > point(50)[0]) expect(part.featureIds).toEqual(['b']);
    }
  });
  it('measures both forward and reverse traversal identically', () => {
    const forward = measureCorridorOverlap(east, corridor)!;
    const reverse = measureCorridorOverlap([...east].reverse(), corridor)!;
    expect(reverse.overlapMeters).toBeCloseTo(forward.overlapMeters, 6);
  });
  it('rejects unknown or malformed data instead of manufacturing zero', () => {
    expect(measureCorridorOverlap([point(0)], corridor)).toBeNull();
    expect(measureCorridorOverlap(east, [line('', point(0), point(100))])).toBeNull();
    expect(measureCorridorOverlap(east, [{ id: 'a', coordinates: [[Infinity, 0], point(0)], infrastructure: 'unknown' }])).toBeNull();
  });
  it('returns unknown if the computation budget is exhausted', () => {
    const route = [point(0), point(50), point(100)];
    expect(measureCorridorOverlap(route, corridor, { maxSegmentComparisons: 1 })).toBeNull();
  });
  it.each([
    { toleranceMeters: 0 }, { toleranceMeters: 16 }, { toleranceMeters: NaN },
    { maxHeadingDeviationDegrees: 90 }, { maxSegmentComparisons: Infinity },
  ])('rejects unsafe options %s', options => {
    expect(measureCorridorOverlap(east, corridor, options)).toBeNull();
  });
  it('does not count zero-length route or corridor segments', () => {
    const result = measureCorridorOverlap([point(0), point(0)], corridor)!;
    expect(result.overlapMeters).toBe(0);
    expect(result.geometryMeters).toBe(0);
    expect(measureCorridorOverlap(east, [line('a', point(0), point(0))])!.overlapMeters).toBe(0);
  });
  it('supports zero-degree heading tolerance for exact alignments', () => {
    expect(measureCorridorOverlap(east, corridor, { maxHeadingDeviationDegrees: 0 })!.overlapMeters).toBeCloseTo(100, 6);
  });
  it('is invariant to splitting mapped geometry and adding overlapping copies', () => {
    for (let split = 10; split < 100; split += 10) {
      const features = [line('one', point(0), point(split)), line('two', point(split), point(100))];
      const result = measureCorridorOverlap(east, [...features, ...features])!;
      expect(result.overlapMeters).toBeCloseTo(100, 5);
      expect(result.overlapMeters).toBeLessThanOrEqual(result.geometryMeters + 1e-8);
      const highlightedLength = result.parts.reduce((sum, part) => sum + distanceM(...part.coordinates), 0);
      expect(highlightedLength).toBeCloseTo(result.overlapMeters, 5);
    }
  });
  it('retains the documented local projection accuracy at both domain latitude edges', () => {
    for (const latitude of [45.6, 45.9]) {
      const mapped: Coordinate[] = [[21.1, latitude], [21.11, latitude]];
      const result = measureCorridorOverlap(mapped, [{ id: 'edge', coordinates: mapped, infrastructure: 'unknown' }])!;
      expect(result.overlapMeters).toBeCloseTo(distanceM(mapped[0]!, mapped[1]!), 6);
    }
  });
  it('returns known zero for a valid empty eligible set', () => {
    expect(measureCorridorOverlap(east, [])!.overlapMeters).toBe(0);
  });
});
