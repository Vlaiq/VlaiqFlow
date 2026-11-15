import { afterEach, describe, expect, it, vi } from 'vitest';
import { accuracyLabel, locate, MAX_START_ACCURACY_M } from './locate';

type Reply = { accuracy: number } | { error: number };
/** Synthetic geolocation: one reply per call, in order (first = precise GPS, second = network). */
function fakeGeolocation(replies: Reply[]) {
  const calls: PositionOptions[] = [];
  vi.stubGlobal('navigator', {
    geolocation: {
      getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback, options: PositionOptions) => {
        calls.push(options);
        const r = replies.shift()!;
        if ('error' in r) fail({ code: r.error } as GeolocationPositionError);
        else ok({ coords: { longitude: 21.2257, latitude: 45.7537, accuracy: r.accuracy } } as GeolocationPosition);
      },
    },
  });
  vi.stubGlobal('window', { isSecureContext: true });
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('locate', () => {
  it('uses precise GPS when it answers', async () => {
    const calls = fakeGeolocation([{ accuracy: 12 }]);
    expect(await locate()).toEqual({ ok: true, coordinate: [21.2257, 45.7537], accuracy: 12 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.enableHighAccuracy).toBe(true);
  });
  it('falls back to the network position when GPS times out (a laptop without GPS)', async () => {
    const calls = fakeGeolocation([{ error: 3 }, { accuracy: 1800 }]);
    expect(await locate()).toMatchObject({ ok: true, accuracy: 1800 });
    expect(calls[1]!.enableHighAccuracy).toBe(false);
  });
  it('accepts an approximate position up to the limit and refuses beyond it', async () => {
    fakeGeolocation([{ accuracy: MAX_START_ACCURACY_M + 1 }, { accuracy: MAX_START_ACCURACY_M + 500 }]);
    expect(await locate()).toEqual({ ok: false, reason: 'imprecise', accuracy: MAX_START_ACCURACY_M + 1 });
  });
  it('stops at an explicit refusal without asking twice', async () => {
    const calls = fakeGeolocation([{ error: 1 }]);
    expect(await locate()).toEqual({ ok: false, reason: 'denied' });
    expect(calls).toHaveLength(1);
  });
  it('reports a browser without localisation', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { isSecureContext: true });
    expect(await locate()).toEqual({ ok: false, reason: 'unsupported' });
  });
  it('labels precision in metres or kilometres', () => {
    expect(accuracyLabel(38.4)).toBe('±38 m');
    expect(accuracyLabel(1234)).toBe('±1,2 km');
  });
});
