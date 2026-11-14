import { describe, expect, it } from 'vitest';
import { arrivalWalkFromUrl, arrivalWalkHref, handoffFromUrl, handoffParams } from './scenario';

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

describe('walking leg handed back to the planner on arrival', () => {
  const walk = {
    from: { name: 'Stradă cu plată: Strada Piatra Craiului', coordinate: [21.223869, 45.752935] as [number, number] },
    to: { name: 'Piața Victoriei', coordinate: [21.22528, 45.752819] as [number, number] },
  };

  it('round-trips both places through the planner link', () => {
    const href = arrivalWalkHref(walk);
    expect(href.startsWith('/?')).toBe(true);
    expect(arrivalWalkFromUrl(href.slice(1))).toEqual(walk);
  });

  it('ignores links without both places or outside the routing area', () => {
    expect(arrivalWalkFromUrl('')).toBeNull();
    expect(arrivalWalkFromUrl('?walkFrom=21.22,45.75&walkFromName=A&walkToName=B')).toBeNull();
    expect(arrivalWalkFromUrl('?walkFrom=2,4&walkFromName=A&walkTo=21.22,45.75&walkToName=B')).toBeNull();
  });
});
