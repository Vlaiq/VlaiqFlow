import { describe, expect, it } from 'vitest';
import { handoffFromUrl, handoffParams } from './scenario';

describe('parking handoff for the DEMO "parking full" scenario', () => {
  const params = handoffParams({
    chance: 0.6412,
    walkMinutes: 2.34,
    backup: { name: 'Parcare B', coordinate: [21.2241, 45.7522], chance: 0.95, walkMinutes: 9.2 },
    final: { name: 'Piața Victoriei', coordinate: [21.22528, 45.752819] },
  });

  it('round-trips SmartMatch numbers through the URL without changing them', () => {
    const h = handoffFromUrl(`?${new URLSearchParams({ to: '21.22,45.75', name: 'A', ...params })}`);
    expect(h.current).toEqual({ chance: 0.641, walkMinutes: 2.3 });
    expect(h.backup).toMatchObject({ chance: 0.95, walkMinutes: 9.2, place: { name: 'Parcare B', coordinate: [21.2241, 45.7522] } });
    expect(h.final).toEqual({ name: 'Piața Victoriei', coordinate: [21.22528, 45.752819] });
  });

  it('drops malformed or out-of-area values instead of guessing', () => {
    const bad = handoffFromUrl(
      `?${new URLSearchParams({ ...params, altChance: '1.7', final: '2.35,48.85', chance: 'abc' })}`,
    );
    expect(bad.backup).toBeNull(); // chance outside 0–1
    expect(bad.final).toBeNull(); // Paris is outside the routing area
    expect(bad.current.chance).toBeNull();
    expect(handoffFromUrl('').backup).toBeNull();
  });

  it('sends nothing for missing data', () => {
    expect(handoffParams({})).toEqual({});
  });
});
