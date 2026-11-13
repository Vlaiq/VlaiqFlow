import { describe, expect, it } from 'vitest';
import type { Coordinate, NavigationRoute } from '@vlaiq/shared';
import {
  bearing,
  cumulative,
  distance,
  formatDistance,
  instruction,
  project,
  sample,
  tripMetrics,
} from './geometry';

// Synthetic geometry solely for math tests; never shipped as a demo route.
const geometry: Coordinate[] = [
  [21.22, 45.75],
  [21.221, 45.75],
  [21.221, 45.751],
];
const lengths = cumulative(geometry);
const route: NavigationRoute = {
  id: 'test',
  geometry,
  distance: 200,
  duration: 40,
  quality: 'estimated',
  source: 'test fixture',
  steps: [
    { index: 0, type: 'depart', road: '' },
    { index: 1, type: 'turn', modifier: 'left', road: 'Test road' },
    { index: 2, type: 'arrive', road: '' },
  ],
};
describe('navigation geometry', () => {
  it('measures geodesic distance and bearings in GeoJSON coordinate order', () => {
    expect(distance([0, 0], [0, 1])).toBeCloseTo(111195, -1);
    expect(bearing(geometry[0]!, geometry[1]!)).toBeCloseTo(90, 1);
    expect(bearing(geometry[1]!, geometry[2]!)).toBeCloseTo(0, 1);
  });
  it('interpolates on road segments rather than a direct origin-destination diagonal', () => {
    const p = sample(geometry, lengths, lengths[1]! / 2);
    expect(p.coordinate[1]).toBe(45.75);
    expect(p.coordinate[0]).toBeCloseTo(21.2205, 5);
    expect(sample(geometry, lengths, 1e9).coordinate).toEqual(geometry.at(-1));
  });
  it('projects to the route and exposes off-route distance', () => {
    const p = project([21.2205, 45.7501], geometry, lengths);
    expect(p.progress).toBeCloseTo(lengths[1]! / 2, 0);
    expect(p.distance).toBeCloseTo(11.1, 0);
    expect(p.coordinate[1]).toBe(45.75);
  });
  it('restricts projection at distant repeated intersections', () => {
    const loop: Coordinate[] = [
      [21.22, 45.75],
      [21.23, 45.75],
      [21.23, 45.76],
      [21.22, 45.75],
    ];
    const p = project([21.22, 45.75], loop, cumulative(loop), 0);
    expect(p.progress).toBe(0);
  });
  it('advances maneuvers and scales remaining ETA and distance from provider totals', () => {
    const before = tripMetrics(route, lengths, 0);
    expect(before.step.type).toBe('turn');
    expect(before.remaining).toBe(200);
    expect(before.seconds).toBe(40);
    const after = tripMetrics(route, lengths, lengths[1]! + 10);
    expect(after.step.type).toBe('arrive');
    expect(after.seconds).toBeLessThan(40);
    const end = tripMetrics(route, lengths, lengths.at(-1)!);
    expect(end.remaining).toBe(0);
    expect(end.seconds).toBe(0);
  });
  it('handles duplicate coordinates and unknown street names without inventing guidance', () => {
    expect(sample([geometry[0]!, geometry[0]!], [0, 0], 0).coordinate).toEqual(geometry[0]);
    expect(instruction(route.steps[1])).toBe('Virează la stânga');
    expect(instruction()).toBe('Pregătim traseul');
    expect(formatDistance(860)).toBe('860 m');
  });
});
