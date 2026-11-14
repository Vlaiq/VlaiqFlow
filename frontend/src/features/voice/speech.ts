import type { NavigationSpeechEvent } from '../../../../shared/src/flowVoice';

export interface SpeechScope {
  session: string;
  revision: string;
  step: string | null;
  enabled: boolean;
  muted: boolean;
}
interface SpeechDependencies {
  now(): number;
  synthesize(event: NavigationSpeechEvent, signal: AbortSignal): Promise<Blob | null>;
  play(blob: Blob, event: NavigationSpeechEvent, valid: () => boolean): Promise<void>;
  fallback(event: NavigationSpeechEvent, valid: () => boolean): Promise<void>;
  stop(): void;
  quiesce(): Promise<void>;
}
/** One audio owner. No conversation audio resumes automatically after navigation takes ownership. */
export class SpeechArbiter {
  private scope: SpeechScope = {
    session: '',
    revision: '',
    step: null,
    enabled: false,
    muted: true,
  };
  private epoch = 0;
  private controller = new AbortController();
  private seen = new Set<string>();
  private warmed = new Map<string, Promise<Blob | null>>();
  private active: NavigationSpeechEvent | null = null;
  last: NavigationSpeechEvent | null = null;
  constructor(private deps: SpeechDependencies) {}
  sync(next: SpeechScope) {
    const routeChanged =
      next.revision !== this.scope.revision || next.session !== this.scope.session;
    if (routeChanged || next.step !== this.scope.step || next.muted || !next.enabled) {
      this.cancel();
      this.last = null;
      if (routeChanged) this.seen.clear();
    }
    this.scope = next;
  }
  private valid(event: NavigationSpeechEvent) {
    return (
      this.scope.enabled &&
      !this.scope.muted &&
      event.session_id === this.scope.session &&
      event.route_revision === this.scope.revision &&
      event.expires_at_ms > this.deps.now() &&
      (event.step_id === null || event.step_id === this.scope.step)
    );
  }
  private key(event: NavigationSpeechEvent) {
    return event.phase === 'status'
      ? event.event_id
      : `${event.route_revision}:${event.step_id}:${event.phase}`;
  }
  cancel() {
    this.epoch++;
    this.controller.abort();
    this.controller = new AbortController();
    this.warmed.clear();
    this.active = null;
    this.last = null;
    this.deps.stop();
  }
  currentInstruction() {
    return this.last
      ? {
          text: this.last.text,
          current: this.valid(this.last),
          route_revision: this.last.route_revision,
        }
      : null;
  }
  warm(event: NavigationSpeechEvent) {
    if (!this.valid(event)) return;
    const key = `${event.locale}:${event.text}`;
    if (!this.warmed.has(key)) {
      if (this.warmed.size >= 8) this.warmed.delete(this.warmed.keys().next().value!);
      this.warmed.set(
        key,
        this.deps.synthesize(event, this.controller.signal).catch(() => null),
      );
    }
  }
  async announce(event: NavigationSpeechEvent) {
    if (!this.valid(event) || this.seen.has(this.key(event))) return false;
    if (this.active?.priority === 'urgent' && event.priority !== 'urgent') return false;
    // A prepare event can never displace a now event for that same manoeuvre.
    if (event.phase === 'prepare' && this.seen.has(`${event.route_revision}:${event.step_id}:now`))
      return false;
    const key = this.key(event);
    this.seen.add(key);
    if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value!);
    this.deps.stop();
    const ticket = ++this.epoch;
    this.active = event;
    const valid = () => ticket === this.epoch && this.valid(event);
    // Muting + closing the old conversation avoids replaying buffered speech after a turn.
    try {
      await this.deps.quiesce();
    } catch {
      return false;
    }
    if (!valid()) return false;
    this.warm(event);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const blob = await Promise.race([
      this.warmed.get(`${event.locale}:${event.text}`) ?? Promise.resolve(null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), event.priority === 'urgent' ? 80 : 350);
      }),
    ]);
    clearTimeout(timer);
    if (!valid()) return false;
    this.last = event;
    try {
      if (blob) await this.deps.play(blob, event, valid);
      else await this.deps.fallback(event, valid);
    } catch {
      if (!blob || !valid()) return false;
      try {
        await this.deps.fallback(event, valid);
      } catch {
        return false;
      }
    }
    if (ticket === this.epoch) this.active = null;
    return true;
  }
  repeat() {
    const event = this.last;
    if (!event || !this.valid(event)) return Promise.resolve(false);
    return this.announce({
      ...event,
      event_id: crypto.randomUUID(),
      phase: 'status',
      priority: 'urgent',
    });
  }
}

let audio: HTMLAudioElement | null = null;
let finishPlayback: (() => void) | null = null;
let conversationStop: (() => Promise<void>) | null = null;
export function registerConversationStop(stop: () => Promise<void>) {
  conversationStop = stop;
  return () => {
    if (conversationStop === stop) conversationStop = null;
  };
}
const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export const navigationSpeech = new SpeechArbiter({
  now: Date.now,
  synthesize: async (event, signal) => {
    const response = await fetch(`${base}/api/flow-voice/speech`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Flow-Voice': '1' },
      body: JSON.stringify({ text: event.text, locale: event.locale }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(4500)]),
    });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) return null;
    return response.blob();
  },
  stop: () => {
    audio?.pause();
    audio = null;
    window.speechSynthesis?.cancel();
    finishPlayback?.();
    finishPlayback = null;
  },
  quiesce: async () => {
    await conversationStop?.();
  },
  play: (blob, event, valid) =>
    new Promise<void>((resolve, reject) => {
      if (!valid() || document.visibilityState !== 'visible') return resolve();
      const url = URL.createObjectURL(blob);
      const player = new Audio(url);
      audio = player;
      const timer = setTimeout(
        () => done(),
        Math.min(20000, Math.max(0, event.expires_at_ms - Date.now())),
      );
      let complete = false;
      const done = (error?: Error) => {
        if (complete) return;
        complete = true;
        clearTimeout(timer);
        player.pause();
        player.removeAttribute('src');
        URL.revokeObjectURL(url);
        if (audio === player) audio = null;
        if (finishPlayback === finish) finishPlayback = null;
        if (error) reject(error);
        else resolve();
      };
      const finish = () => done();
      finishPlayback = finish;
      player.onended = () => done();
      player.onerror = () => done(new Error('audio'));
      if (!valid()) return done();
      void player.play().catch(() => done(new Error('autoplay')));
    }),
  fallback: (event, valid) =>
    new Promise<void>((resolve) => {
      if (!valid() || document.visibilityState !== 'visible' || !window.speechSynthesis)
        return resolve();
      const speech = new SpeechSynthesisUtterance(event.text);
      speech.lang = event.locale === 'ro' ? 'ro-RO' : 'en-US';
      const timer = setTimeout(
        () => {
          window.speechSynthesis.cancel();
          done();
        },
        Math.min(20000, Math.max(0, event.expires_at_ms - Date.now())),
      );
      const done = () => {
        clearTimeout(timer);
        if (finishPlayback === done) finishPlayback = null;
        resolve();
      };
      finishPlayback = done;
      speech.onend = done;
      speech.onerror = done;
      if (valid()) window.speechSynthesis.speak(speech);
      else done();
    }),
});
