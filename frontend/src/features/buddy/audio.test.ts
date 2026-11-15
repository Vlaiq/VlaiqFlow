import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBuddyAudio } from './audio';
import { registerConversationGate } from '../voice/speech';
import type { BuddyAudioState } from '../../../../shared/src/buddy/contracts';

// Synthetic media lifecycle tests: never proof of real microphone or provider playback.
class FakeRecognition {
  static current: FakeRecognition;
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.current = this;
  }
  start() {}
  abort() {}
}
class FakePlayer {
  static current: FakePlayer;
  onplay: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakePlayer.current = this;
  }
  async play() {
    this.onplay?.();
  }
  pause() {
    this.onpause?.();
  }
  removeAttribute() {}
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function setup(
  speech = async () => new Blob(['synthetic'], { type: 'audio/mpeg' }),
  navigation = false,
) {
  vi.stubGlobal('window', { isSecureContext: true, SpeechRecognition: FakeRecognition });
  vi.stubGlobal('Audio', FakePlayer);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const events: BuddyAudioState[] = [];
  const bridge = createBuddyAudio({
    speech,
    navigationActive: () => navigation,
    onState: (state) => events.push(state),
  });
  return { bridge, events };
}
describe('Buddy push-to-talk lifecycle (synthetic media)', () => {
  it('never autostarts, only animates talking on real player callbacks, and stops on end', async () => {
    const { bridge, events } = setup();
    expect(events).toEqual([]);
    await bridge.speak('', 'ro');
    expect(events.at(-1)).toBe('playing');
    FakePlayer.current.onended?.();
    expect(events.at(-1)).toBe('off');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic');
    bridge.dispose();
  });
  it('microphone input never masquerades as assistant speech', async () => {
    const { bridge, events } = setup();
    const transcript = vi.fn();
    await bridge.listen('ro', transcript);
    expect(events.at(-1)).toBe('listening');
    expect(events).not.toContain('playing');
    FakeRecognition.current.onresult?.({ results: [[{ transcript: 'De ce mergem pe jos?' }]] });
    expect(transcript).toHaveBeenCalledWith('De ce mergem pe jos?');
    expect(events.at(-1)).toBe('off');
    bridge.dispose();
  });
  it('cancels late audio after stop/logout without restarting the player', async () => {
    let resolve!: (b: Blob) => void;
    const pending = new Promise<Blob>((r) => {
      resolve = r;
    });
    const { bridge, events } = setup(() => pending);
    const playing = bridge.speak('', 'ro');
    bridge.dispose();
    resolve(new Blob(['late'], { type: 'audio/mpeg' }));
    await playing;
    expect(events).not.toContain('playing');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('refuses to compete with active navigation speech', async () => {
    const { bridge, events } = setup(undefined, true);
    await expect(bridge.speak('', 'ro')).rejects.toThrow('ghidarea');
    await expect(bridge.listen('ro', () => {})).rejects.toThrow('ghidarea');
    expect(events).not.toContain('playing');
    bridge.dispose();
    const existing = registerConversationGate({ busy: () => true, hold: () => {} });
    const next = setup();
    await expect(next.bridge.speak('', 'ro')).rejects.toThrow('FLOW Voice');
    expect(next.events).not.toContain('playing');
    next.bridge.dispose();
    existing();
  });
  it('reports permission failures honestly and removes recording callbacks', async () => {
    const { bridge, events } = setup();
    await bridge.listen('ro', () => {});
    FakeRecognition.current.onerror?.();
    expect(events.at(-1)).toBe('error');
    expect(FakeRecognition.current.onresult).toBeNull();
    bridge.dispose();
  });
});
