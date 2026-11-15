import { afterEach, describe, expect, it, vi } from 'vitest';
import { JourneyTools, type JourneyToolAdapter, TOOL_BUDGET, FlowError } from './tools';
import type { JourneyContext } from '../../../../shared/src/flowVoice';

const snapshot = (): JourneyContext => ({
  environment: 'live',
  origin: null,
  destination: null,
  preferences: { priority: null, max_walking_minutes: 5, journey_mode: 'driving' },
  comparison: null,
  selected_journey: null,
  navigation: {
    active: false,
    route_revision: null,
    remaining_distance_meters: null,
    remaining_duration_seconds: null,
    last_instruction: null,
  },
});
function setup() {
  let revision = '1';
  const state = snapshot();
  const adapter: JourneyToolAdapter<string> = {
    revision: () => revision,
    context: () => state,
    update: vi.fn((patch) => {
      state.preferences = { ...state.preferences, ...patch };
      return {
        preferences: state.preferences,
        changed_fields: Object.keys(patch) as (keyof typeof state.preferences)[],
      };
    }),
    calculate: vi.fn(async () => 'plan'),
    commit: vi.fn(() => ({ comparison_id: 'comparison' }) as ReturnType<typeof adapter.commit>),
    select: vi.fn(
      async () =>
        ({
          environment: 'live',
          comparison_id: 'comparison',
          journey: { journey_id: 'journey' },
          map_highlighted: false,
        }) as Awaited<ReturnType<typeof adapter.select>>,
    ),
  };
  const tools = new JourneyTools(adapter);
  tools.begin();
  return {
    tools,
    adapter,
    state,
    change: () => {
      revision = String(Number(revision) + 1);
    },
  };
}
afterEach(() => vi.useRealTimers());
describe('FLOW tools: runtime contract and concurrency', () => {
  it.each([
    ['get_journey_context', { extra: true }],
    ['get_journey_context', null],
    ['update_journey_preferences', {}],
    ['update_journey_preferences', { priority: 'free' }],
    ['update_journey_preferences', { max_walking_minutes: -1 }],
    ['update_journey_preferences', { max_walking_minutes: 181 }],
    ['update_journey_preferences', { max_walking_minutes: 2.5 }],
    ['update_journey_preferences', { journey_mode: 'flying' }],
    ['compare_journeys', { destination_text: '   ' }],
    ['compare_journeys', { url: 'https://evil.example' }],
    ['select_and_explain_journey', { comparison_id: 'c' }],
  ] as const)('rejects %s malformed input before effects', async (name, input) => {
    const { tools, adapter } = setup();
    expect(JSON.parse(await tools.call(name, input))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    expect(adapter.update).not.toHaveBeenCalled();
    expect(adapter.calculate).not.toHaveBeenCalled();
    expect(adapter.select).not.toHaveBeenCalled();
  });
  it('preserves the five-minute limit on cheaper follow-up and accepts both walking boundaries', async () => {
    const { tools, state } = setup();
    expect(
      JSON.parse(await tools.call('update_journey_preferences', { priority: 'cheapest' })),
    ).toMatchObject({
      ok: true,
      data: {
        changed_fields: ['priority'],
        preferences: { max_walking_minutes: 5, priority: 'cheapest' },
      },
    });
    for (const limit of [0, 180])
      expect(
        JSON.parse(await tools.call('update_journey_preferences', { max_walking_minutes: limit }))
          .ok,
      ).toBe(true);
    expect(state.preferences.journey_mode).toBe('driving');
    expect(JSON.parse(await tools.call('get_journey_context', {})).data.origin).toBeNull();
  });
  it('deduplicates identical in-flight comparisons', async () => {
    const { tools, adapter } = setup();
    const a = tools.call('compare_journeys', {}),
      b = tools.call('compare_journeys', {});
    expect(a).toBe(b);
    await a;
    expect(adapter.calculate).toHaveBeenCalledTimes(1);
    expect(adapter.commit).toHaveBeenCalledTimes(1);
  });
  it('rejects callbacks retained by an old SDK connection even after a new session starts', async () => {
    const { tools, adapter } = setup();
    const old = tools.handlers();
    tools.end();
    tools.begin();
    expect(
      JSON.parse(await old.update_journey_preferences!({ priority: 'cheapest' })),
    ).toMatchObject({ ok: false, error: { code: 'STALE_CONTEXT' } });
    expect(adapter.update).not.toHaveBeenCalled();
  });
  it.each(['manual', 'session', 'newer'] as const)(
    'prevents a late result committing after %s change',
    async (kind) => {
      const { tools, adapter, change } = setup();
      let resolve!: (value: string) => void;
      vi.mocked(adapter.calculate).mockImplementation(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      );
      const first = tools.call('compare_journeys', {});
      if (kind === 'manual') change();
      else if (kind === 'session') tools.end();
      else await tools.call('update_journey_preferences', { priority: 'cheapest' });
      resolve('old');
      expect(JSON.parse(await first)).toMatchObject({
        ok: false,
        error: { code: 'STALE_CONTEXT' },
      });
      expect(adapter.commit).not.toHaveBeenCalled();
    },
  );
  it('times out inside provider budget and rejects an upstream that ignores cancellation', async () => {
    vi.useFakeTimers();
    const { tools, adapter } = setup();
    let resolve!: (value: string) => void;
    vi.mocked(adapter.calculate).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const result = tools.call('compare_journeys', {});
    await vi.advanceTimersByTimeAsync(TOOL_BUDGET.compare_journeys);
    expect(JSON.parse(await result)).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    resolve('too late');
    await Promise.resolve();
    expect(adapter.commit).not.toHaveBeenCalled();
  });
  it('lets the adapter decide route changes during navigation and reports map false truthfully', async () => {
    const { tools, state, adapter } = setup();
    state.navigation.active = true;
    const input = { comparison_id: 'comparison', journey_id: 'journey' };
    expect(
      JSON.parse(await tools.call('select_and_explain_journey', input)).data.map_highlighted,
    ).toBe(false);
    expect(adapter.select).toHaveBeenCalledTimes(1);
  });
  it.each([
    'MISSING_ORIGIN',
    'AMBIGUOUS_LOCATION',
    'NO_ROUTE',
    'NO_MATCH',
    'SERVICE_UNAVAILABLE',
  ] as const)('preserves structured %s errors', async (code) => {
    const { tools, adapter } = setup();
    vi.mocked(adapter.calculate).mockRejectedValue(
      new FlowError(
        code,
        'Fără rezultat',
        code === 'AMBIGUOUS_LOCATION' ? [{ label: 'A' }, { label: 'B' }] : undefined,
      ),
    );
    expect(JSON.parse(await tools.call('compare_journeys', {})).error.code).toBe(code);
  });
});
