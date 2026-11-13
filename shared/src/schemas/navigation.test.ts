import { expect, it } from 'vitest';
import { NavigationRoute, RouteRequest } from './navigation';
it('rejects invalid coordinates before any routing request', () => {
  expect(RouteRequest.safeParse({ origin: [21, 95], destination: [21, 45] }).success).toBe(false);
});
it('requires real geometry and maneuvers inside its bounds', () => {
  const r = {
    id: 'test',
    geometry: [
      [21, 45],
      [21.01, 45.01],
    ],
    distance: 10,
    duration: 20,
    source: 'test',
    quality: 'estimated',
    steps: [{ index: 2, type: 'turn', road: '' }],
  };
  expect(NavigationRoute.safeParse(r).success).toBe(false);
  expect(
    NavigationRoute.safeParse({ ...r, steps: [{ index: 1, type: 'arrive', road: '' }] }).success,
  ).toBe(true);
});
