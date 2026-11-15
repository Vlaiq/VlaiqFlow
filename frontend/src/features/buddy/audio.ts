import type { BuddyAudioBridge, BuddyAudioState } from '../../../../shared/src/buddy/contracts';
import { acquireConversationGate, navigationSpeech } from '../voice/speech';

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;
/** Lazy-loaded, push-to-talk browser input + Gemini text + ElevenLabs reply playback.
 * The browser's speech recognition may use its provider; no recordings are stored by FLOW.
 * Mouth motion follows actual play/pause/end events; it is NOT phoneme/amplitude lip sync.
 */
export function createBuddyAudio(options: {
  speech(signal: AbortSignal): Promise<Blob>;
  onState(state: BuddyAudioState): void;
  navigationActive(): boolean;
}): BuddyAudioBridge {
  const SpeechRecognition =
    (
      window as unknown as {
        SpeechRecognition?: RecognitionConstructor;
        webkitSpeechRecognition?: RecognitionConstructor;
      }
    ).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: RecognitionConstructor })
      .webkitSpeechRecognition;
  let recognition: Recognition | null = null,
    player: HTMLAudioElement | null = null;
  let controller = new AbortController(),
    releaseGate: (() => void) | null = null;
  let url: string | null = null,
    disposed = false,
    epoch = 0,
    state: BuddyAudioState = 'off';
  const notify = (next: BuddyAudioState) => {
    state = next;
    if (!disposed) options.onState(next);
  };
  const stop = () => {
    epoch++;
    controller.abort();
    controller = new AbortController();
    if (recognition) {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.abort();
      recognition = null;
    }
    if (player) {
      player.onplay = null;
      player.onpause = null;
      player.onended = null;
      player.onerror = null;
      player.pause();
      player.removeAttribute('src');
      player = null;
    }
    if (url) {
      URL.revokeObjectURL(url);
      url = null;
    }
    releaseGate?.();
    releaseGate = null;
    notify('off');
  };
  const claim = () => {
    if (disposed || options.navigationActive() || navigationSpeech.currentInstruction()?.current)
      throw new Error('Oprește ghidarea vocală înainte de Buddy.');
    releaseGate = acquireConversationGate({
      busy: () => state === 'playing' || state === 'listening',
      hold: (held) => {
        // A navigation instruction always wins. Never resume stale Buddy output afterwards.
        if (held) stop();
      },
    });
    if (!releaseGate)
      throw new Error('FLOW Voice este încă activ. Oprește sesiunea înainte de Buddy.');
  };
  return {
    supported: Boolean(SpeechRecognition) && window.isSecureContext,
    async listen(locale, onTranscript) {
      stop();
      if (!SpeechRecognition || !window.isSecureContext)
        throw new Error('Intrarea vocală nu este disponibilă în acest browser. Poți scrie.');
      claim();
      const ticket = epoch;
      recognition = new SpeechRecognition();
      recognition.lang = locale === 'ro' ? 'ro-RO' : 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (e) => {
        const text = e.results[0]?.[0]?.transcript;
        if (ticket !== epoch || disposed) return;
        stop();
        if (text) onTranscript(text.slice(0, 1200));
      };
      recognition.onerror = () => {
        if (ticket !== epoch) return;
        stop();
        notify('error');
      };
      recognition.onend = () => {
        if (ticket === epoch) stop();
      };
      try {
        recognition.start();
        notify('listening');
      } catch {
        stop();
        notify('error');
        throw new Error('Nu am putut porni microfonul. Verifică permisiunea.');
      }
    },
    async speak() {
      stop();
      claim();
      const ticket = epoch;
      notify('preparing');
      try {
        const blob = await options.speech(controller.signal);
        if (disposed || ticket !== epoch) return;
        if (!blob.type.startsWith('audio/')) throw new Error('Audio indisponibil.');
        url = URL.createObjectURL(blob);
        player = new Audio(url);
        player.onplay = () => {
          if (ticket === epoch) notify('playing');
        };
        player.onpause = () => {
          if (ticket === epoch) notify('paused');
        };
        player.onended = () => {
          if (ticket === epoch) stop();
        };
        player.onerror = () => {
          if (ticket === epoch) {
            stop();
            notify('error');
          }
        };
        await player.play();
      } catch (e) {
        if (ticket === epoch) {
          stop();
          notify('error');
          throw e;
        }
      }
    },
    stop,
    dispose() {
      stop();
      disposed = true;
    },
  };
}
