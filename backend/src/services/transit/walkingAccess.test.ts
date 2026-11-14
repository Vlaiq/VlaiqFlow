import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../activeRouting', () => ({ activeDirections: vi.fn() }));
import { activeDirections } from '../activeRouting';
import { existingWalkingAccess } from './walkingAccess';
import { fixtureWalk } from './fixtures';
const active = vi.mocked(activeDirections);
beforeEach(() => { active.mockReset(); });
it('reuses the existing walk adapter and preserves actual provider geometry/metrics/source', async () => {
  const f = fixtureWalk();
  active.mockResolvedValue({ id: 'test', mode: 'walk', practical: true, note: '', route: {
    id: 'test', distance: f.distanceMeters, duration: f.durationSeconds, geometry: f.geometry,
    source: 'TEST existing foot provider', quality: 'estimated', steps: [{ index: 0, type: 'depart', road: '' }],
  } });
  const r = await existingWalkingAccess(f.from, f.to, new AbortController().signal);
  expect(active).toHaveBeenCalledTimes(1);
  expect(active).toHaveBeenCalledWith('walk', f.from, f.to);
  expect(r).toMatchObject({ profile: 'foot-walking', geometry: f.geometry, distanceMeters: f.distanceMeters, source: 'TEST existing foot provider' });
});
it('does not call a provider when already cancelled', async () => {
  const c = new AbortController(); c.abort(); const f = fixtureWalk();
  await expect(existingWalkingAccess(f.from, f.to, c.signal)).rejects.toThrow();
  expect(active).not.toHaveBeenCalled();
});
it('propagates provider failure without a synthetic route', async () => {
  active.mockRejectedValue(new Error('ACTIVE_PROVIDER_UNAVAILABLE')); const f = fixtureWalk();
  await expect(existingWalkingAccess(f.from, f.to, new AbortController().signal)).rejects.toThrow('ACTIVE_PROVIDER_UNAVAILABLE');
});
it('discards a response when cancellation arrives during the existing provider request', async () => {
  const c = new AbortController(), f = fixtureWalk();
  active.mockImplementation(async () => { c.abort(); return {} as never; });
  await expect(existingWalkingAccess(f.from, f.to, c.signal)).rejects.toThrow();
});
