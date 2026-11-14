import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpeechArbiter } from './speech';
import { speechEvent } from '../navigation/speechEvents';
import type { NavigationSpeechEvent } from '../../../../shared/src/flowVoice';
function setup() {
  const deps = {
    now: () => 1000,
    synthesize: vi.fn(async () => null as Blob | null),
    play: vi.fn(async () => {}),
    fallback: vi.fn(async () => {}),
    stop: vi.fn(),
    quiesce: vi.fn(async () => {}),
  };
  const arbiter = new SpeechArbiter(deps);
  const scope = { session: 's', revision: 'r', step: '2', enabled: true, muted: false };
  arbiter.sync(scope);
  const event: NavigationSpeechEvent = {
    session_id: 's',
    route_revision: 'r',
    event_id: 'e',
    step_id: '2',
    phase: 'prepare',
    kind: 'turn',
    text: 'Virează la stânga.',
    locale: 'ro',
    priority: 'normal',
    expires_at_ms: 10000,
  };
  return { arbiter, deps, scope, event };
}
afterEach(() => vi.useRealTimers());
describe('deterministic navigation audio ownership', () => {
  it('quiesces conversation before fallback, deduplicates and supersedes prepare with now', async () => {
    const { arbiter, deps, event } = setup();
    await arbiter.announce(event);
    await arbiter.announce(event);
    expect(deps.fallback).toHaveBeenCalledTimes(1);
    expect(deps.quiesce.mock.invocationCallOrder[0]).toBeLessThan(
      deps.fallback.mock.invocationCallOrder[0]!,
    );
    await arbiter.announce({ ...event, phase: 'now', priority: 'urgent' });
    expect(deps.fallback).toHaveBeenCalledTimes(2);
    expect(await arbiter.announce({ ...event, event_id: 'late-prepare' })).toBe(false);
  });
  it.each(['expired', 'route', 'session', 'step', 'muted', 'hidden'] as const)(
    'rejects %s speech',
    async (kind) => {
      const { arbiter, deps, scope, event } = setup();
      if (kind === 'expired') event.expires_at_ms = 999;
      else if (kind === 'route') event.route_revision = 'old';
      else if (kind === 'session') event.session_id = 'old';
      else if (kind === 'step') event.step_id = 'old';
      else arbiter.sync({ ...scope, muted: kind === 'muted', enabled: kind !== 'hidden' });
      expect(await arbiter.announce(event)).toBe(false);
      expect(deps.synthesize).not.toHaveBeenCalled();
    },
  );
  it('cancels delayed synthesis at a reroute immediately before playback', async () => {
    const { arbiter, deps, scope, event } = setup();
    let resolve!: (blob: Blob | null) => void;
    deps.synthesize.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const result = arbiter.announce(event);
    await Promise.resolve();
    arbiter.sync({ ...scope, revision: 'new' });
    resolve(new Blob(['audio']));
    expect(await result).toBe(false);
    expect(deps.play).not.toHaveBeenCalled();
    expect(deps.fallback).not.toHaveBeenCalled();
  });
  it('falls back promptly on a late network response and never plays that late clip', async () => {
    vi.useFakeTimers();
    const { arbiter, deps, event } = setup();
    let resolve!: (blob: Blob | null) => void;
    deps.synthesize.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const result = arbiter.announce({ ...event, phase: 'now', priority: 'urgent' });
    await vi.advanceTimersByTimeAsync(81);
    expect(await result).toBe(true);
    expect(deps.fallback).toHaveBeenCalledTimes(1);
    resolve(new Blob(['late']));
    await Promise.resolve();
    expect(deps.play).not.toHaveBeenCalled();
  });
  it('repeats only the last valid instruction and clears it when the step changes', async () => {
    const { arbiter, deps, event, scope } = setup();
    await arbiter.announce(event);
    await arbiter.repeat();
    expect(deps.fallback).toHaveBeenCalledTimes(2);
    arbiter.sync({ ...scope, step: '3' });
    expect(await arbiter.repeat()).toBe(false);
  });
  it('keeps an urgent manoeuvre ahead of a normal status message', async () => {
    const { arbiter, deps, event } = setup();
    let finish!: () => void;
    deps.fallback.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const urgent = arbiter.announce({ ...event, phase: 'now', priority: 'urgent' });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(await arbiter.announce({ ...event, phase: 'status', event_id: 'normal' })).toBe(false);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    finish();
    await urgent;
  });
  it('degrades safely if browser speech itself is unavailable or throws', async () => {
    const { arbiter, deps, event } = setup();
    deps.fallback.mockRejectedValue(new Error('SYNTHETIC speech device failure'));
    expect(await arbiter.announce(event)).toBe(false);
  });
  it('reports expiry even if there are no further GPS or React updates', async () => {
    const { arbiter, deps, event } = setup();
    await arbiter.announce(event);
    expect(arbiter.currentInstruction()?.current).toBe(true);
    deps.now = () => event.expires_at_ms + 1;
    expect(arbiter.currentInstruction()?.current).toBe(false);
    arbiter.cancel();
    expect(arbiter.currentInstruction()).toBeNull();
  });
  it('schedules prepare and now by speed/distance, suppresses poor GPS and never announces arrival early', () => {
    const progress = {
      session: 's',
      revision: 'r',
      step: { index: 2, type: 'turn', modifier: 'left', road: 'Stradă de test' },
      distance: 100,
      speed: 10,
      accuracy: 5,
      fixAge: 0,
      demo: true,
      arrived: false,
      parking: true,
      now: 1000,
    };
    expect(speechEvent(progress)).toMatchObject({
      phase: 'prepare',
      text: expect.stringContaining('Simulare'),
    });
    expect(speechEvent({ ...progress, distance: 20 })).toMatchObject({
      phase: 'now',
      priority: 'urgent',
    });
    expect(speechEvent({ ...progress, accuracy: 100 })).toBeNull();
    expect(speechEvent({ ...progress, fixAge: 9000 })).toBeNull();
    expect(speechEvent({ ...progress, step: { ...progress.step, type: 'arrive' } })).toBeNull();
    expect(speechEvent({ ...progress, arrived: true })).toMatchObject({ kind: 'parking_arrival' });
  });
});
