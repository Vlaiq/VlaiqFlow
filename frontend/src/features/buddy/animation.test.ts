import { describe, expect, it } from 'vitest';
import { animationReducer as step, initialAnimation as initial } from './animation';
describe('Buddy animation event priority', () => {
  it('distinguishes listening from actual assistant playback', () => {
    const listening = step(initial, { type: 'LISTEN_START' }); expect(listening.pose).toBe('listening');
    expect(step(listening, { type: 'VOICE_START' }).pose).toBe('talking');
    expect(step(step(initial, { type: 'VOICE_START' }), { type: 'VOICE_END' }).pose).toBe('idle');
  });
  it('celebrates before returning to real ongoing playback', () => {
    let s = step(initial, { type: 'VOICE_START' }); s = step(s, { type: 'MISSION_COMPLETED' });
    expect(s.pose).toBe('celebrating'); expect(step(s, { type: 'GESTURE_END', generation: s.generation }).pose).toBe('talking');
  });
  it('ignores a stale gesture completion and resets account state', () => {
    let s = step(initial, { type: 'ENTER' }); const old = s.generation;
    s = step(s, { type: 'CITY_USER_CHOICE' }); expect(step(s, { type: 'GESTURE_END', generation: old }).pose).toBe('pointing');
    s = step(s, { type: 'RESET' }); expect(s.pose).toBe('idle'); expect(s.speaking).toBe(false);
  });
  it('clears the thinking state on network failure', () => {
    expect(step(step(initial, { type: 'REQUEST_START' }), { type: 'REQUEST_ERROR' }).pose).toBe('encouraging');
  });
});
