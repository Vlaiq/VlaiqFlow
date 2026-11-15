import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ConversationProvider,
  useConversationControls,
  useConversationInput,
  useConversationMode,
  useRawConversation,
} from '@elevenlabs/react';
import { Mic, MicOff, AudioLines } from 'lucide-react';
import { z } from 'zod';
import type { Destination } from '@vlaiq/shared';
import { FLOW_AGENT } from '../../../../shared/src/flowVoice';
import { navigationSpeech, registerConversationGate } from './speech';
import './voice.css';

interface ToolSession {
  handlers(): Record<string, (input: Record<string, unknown>) => Promise<string>>;
  end(): void;
}
type State = 'idle' | 'connecting' | 'listening' | 'speaking' | 'disconnecting' | 'error';
/** The session endpoint refused; `reason` is the server's user-facing message, if it sent one. */
class VoiceUnavailable extends Error {
  constructor(readonly reason: string | null) {
    super('SERVICE_UNAVAILABLE');
  }
}
/** One line of the conversation, kept in memory only and cleared on the next start or page change. */
export interface TranscriptLine {
  /** Session and event, so lines from different sessions never collide. */
  id: string;
  who: 'user' | 'agent';
  text: string;
}
const TRANSCRIPT_LINES = 12;
const TRANSCRIPT_KEY = 'vlaiq-voice-transcript';
/** The conversation survives page changes and reloads in this browser tab (sessionStorage only). */
function loadTranscript(): TranscriptLine[] {
  try {
    const raw = window.sessionStorage.getItem(TRANSCRIPT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (l): l is TranscriptLine =>
              !!l &&
              typeof l.id === 'string' &&
              (l.who === 'user' || l.who === 'agent') &&
              typeof l.text === 'string',
          )
          .slice(-TRANSCRIPT_LINES)
      : [];
  } catch {
    return [];
  }
}
/** Voice-style tags the agent speaks with ("[happy]", "[calm]") are not part of the text. */
const cleanAgentText = (text: string) => text.replace(/[[a-z][a-z _-]{1,24}]s*/gi, '').trim();
/** Speech recognised as noise ("...") is not something the driver said. */
const isNoise = (text: string) => !/[p{L}p{N}]/u.test(text);
interface VoiceContextValue {
  state: State;
  transcript: TranscriptLine[];
  error: string | null;
  muted: boolean;
  outputMuted: boolean;
  activity: number;
  start(): void;
  stop(): void;
  toggleMic(): void;
  toggleOutput(): void;
  /** Tells a connected agent about something the user did on screen; no-op when not connected. */
  tell(text: string): void;
  register(tools: ToolSession, begin: () => void, summary?: () => string | null): () => void;
}
const Context = createContext<VoiceContextValue | null>(null);
// Planner registration must not subscribe the map subtree to high-frequency VAD/UI updates.
const RegistrationContext = createContext<VoiceContextValue['register'] | null>(null);
/** What the driver says, for the app's own reactions ("hai să mergem"), plus a way to tell the agent. */
interface Heard {
  subscribe(listener: (text: string) => void): () => void;
  tell(text: string): void;
}
const HeardContext = createContext<Heard | null>(null);
/** FLOW Voice is optional: off until the user turns it on from the menu (remembered per browser). */
interface Enabled {
  enabled: boolean;
  setEnabled(next: boolean): void;
}
const EnabledContext = createContext<Enabled>({ enabled: false, setEnabled: () => {} });
const ENABLED_KEY = 'vlaiq-voice-enabled';
function loadEnabled() {
  try {
    return window.localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function FlowVoiceProvider({ children }: { children: ReactNode }) {
  return (
    <ConversationProvider>
      <VoiceRuntime>{children}</VoiceRuntime>
    </ConversationProvider>
  );
}
function VoiceRuntime({ children }: { children: ReactNode }) {
  const controls = useConversationControls();
  const raw = useRawConversation();
  const rawRef = useRef(raw);
  rawRef.current = raw;
  const input = useConversationInput();
  const { isSpeaking } = useConversationMode();
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);
  const [outputMuted, setOutputMuted] = useState(false);
  const [activity, setActivity] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptLine[]>(loadTranscript);
  const [enabled, setEnabledState] = useState(loadEnabled);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  useEffect(() => {
    try {
      window.sessionStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(transcript));
    } catch {
      /* private mode: the conversation still shows for this page */
    }
  }, [transcript]);
  const registration = useRef<{
    tools: ToolSession;
    begin: () => void;
    summary?: () => string | null;
  } | null>(null);
  const active = useRef<{ id: number; controller: AbortController; tools: ToolSession } | null>(
    null,
  );
  const generation = useRef(0);
  const sdkStarted = useRef(false);
  const closing = useRef<{ id: number; promise: Promise<void>; finish: () => void } | null>(null);
  const failure = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(true);
  const listeners = useRef(new Set<(text: string) => void>());
  const stateRef = useRef<State>('idle');
  stateRef.current = state;
  const speakingRef = useRef(false);
  speakingRef.current = isSpeaking;
  const outputMutedRef = useRef(false);
  outputMutedRef.current = outputMuted;
  const inputRef = useRef(input);
  inputRef.current = input;
  /** Last moment the driver's microphone picked up speech or the agent answered. */
  const lastVoice = useRef(0);
  const lastUserAt = useRef(0);
  const lastAgentAt = useRef(0);
  const held = useRef<{ micWasMuted: boolean } | null>(null);
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const heard = useRef<Heard>({
    subscribe: (listener) => {
      listeners.current.add(listener);
      return () => listeners.current.delete(listener);
    },
    tell: (text) => {
      if (stateRef.current === 'listening' || stateRef.current === 'speaking')
        controlsRef.current.sendContextualUpdate(text);
    },
  });
  const register = useCallback(
    (tools: ToolSession, begin: () => void, summary?: () => string | null) => {
    const entry = { tools, begin, summary };
    registration.current = entry;
    return () => {
      tools.end();
      if (registration.current === entry) registration.current = null;
    };
  },
    [],
  );
  const stop = useCallback(() => {
    if (closing.current) return closing.current.promise;
    const previous = active.current;
    const conversation = rawRef.current;
    generation.current++;
    previous?.controller.abort();
    previous?.tools.end();
    active.current = null;
    clearTimeout(timer.current);
    if (mounted.current) setActivity(0);
    if (mounted.current)
      setState(previous || conversation ? 'disconnecting' : failure.current ? 'error' : 'idle');
    let finish!: () => void;
    let finished = false;
    const promise = new Promise<void>((resolve) => {
      finish = () => {
        if (finished) return;
        finished = true;
        closing.current = null;
        sdkStarted.current = false;
        if (mounted.current) setState(failure.current ? 'error' : 'idle');
        resolve();
      };
    });
    closing.current = { id: previous?.id ?? -1, promise, finish };
    if (conversation) void conversation.endSession().then(finish, finish);
    else {
      controls.endSession();
      if (!sdkStarted.current) finish();
    }
    // Pending SDK connections keep the start lock until their disconnect/error callback.
    return promise;
  }, [controls.endSession]);
  // Navigation speech waits while the conversation is busy, then holds it (mic and agent muted)
  // for the few seconds of an instruction, and gives it back. The session is never ended for it.
  useEffect(
    () =>
      registerConversationGate({
        // Busy while either side talks, while FLOW is still answering the driver, and for a
        // few seconds after: an instruction never lands in the middle of a conversation.
        busy: () => {
          if (stateRef.current !== 'listening' && stateRef.current !== 'speaking') return false;
          const now = Date.now();
          const awaitingAnswer =
            lastUserAt.current > lastAgentAt.current && now - lastUserAt.current < 8000;
          return speakingRef.current || awaitingAnswer || now - lastVoice.current < 3500;
        },
        // Only the microphone pauses during an instruction (so FLOW does not hear it as the
        // driver). FLOW's own voice is never muted: if it starts talking, the instruction stops.
        hold: (on) => {
          if (on && !held.current) {
            held.current = { micWasMuted: inputRef.current.isMuted };
            inputRef.current.setMuted(true);
          } else if (!on && held.current) {
            inputRef.current.setMuted(held.current.micWasMuted);
            held.current = null;
          }
        },
      }),
    [],
  );
  // The session and the conversation stay across every page: the driver can switch screens and
  // FLOW still knows what was said. One button (on any page) ends it.
  // End the session only when the app really unmounts. Depending on \`stop\` here would end a live
  // conversation whenever the SDK hands out a new endSession function on a re-render.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void stopRef.current();
    };
  }, []);
  const start = useCallback(async () => {
    if (!enabledRef.current || active.current || closing.current || !registration.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Microfonul necesită HTTPS și un browser compatibil.');
      setState('error');
      return;
    }
    const entry = registration.current;
    const id = ++generation.current;
    const controller = new AbortController();
    active.current = { id, controller, tools: entry.tools };
    const valid = () => mounted.current && active.current?.id === id && !controller.signal.aborted;
    failure.current = null;
    setState('connecting');
    setError(null);
    setOutputMuted(false);
    const fail = (message: string) => {
      if (!valid()) return;
      failure.current = message;
      setError(message);
      void stop();
    };
    timer.current = setTimeout(
      () => fail('Conectarea a durat prea mult. Verifică rețeaua și reîncearcă.'),
      25000,
    );
    try {
      // Permission is requested only from this explicit click. The SDK owns the actual call stream.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      if (!valid()) return;
      const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
      const response = await fetch(`${base}/api/flow-voice/session`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Flow-Voice': '1' },
        body: '{}',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) {
        // Show the server's own reason (missing key, wrong address, provider refused, busy).
        const reason = await response
          .json()
          .then((body) => z.object({ error: z.object({ message: z.string().max(200) }) }).parse(body))
          .catch(() => null);
        throw new VoiceUnavailable(reason?.error.message ?? null);
      }
      const token = z
        .object({
          conversationToken: z.string().min(1),
          agentVersion: z.literal(FLOW_AGENT.version),
        })
        .parse(await response.json());
      if (!valid()) return;
      entry.begin();
      sdkStarted.current = true;
      controls.startSession({
        conversationToken: token.conversationToken,
        connectionType: 'webrtc',
        clientTools: entry.tools.handlers(),
        onConnect: () => {
          if (valid()) {
            clearTimeout(timer.current);
            // The agent must be heard, like a car navigator: never start a session silent.
            rawRef.current?.setVolume({ volume: 1 });
            // One button controls FLOW Voice: a session always starts listening.
            if (inputRef.current.isMuted) inputRef.current.setMuted(false);
            setState('listening');
            // A new session starts from what the app already knows (trip planned on the home
            // screen, navigation in progress), so the agent does not ask again.
            const summary = registration.current?.summary?.();
            const recent = transcriptRef.current
              .slice(-6)
              .map((l) => `${l.who === 'user' ? 'Șoferul' : 'FLOW'}: ${l.text}`)
              .join(' | ');
            const context = [
              summary,
              recent && `Conversația de până acum (continuă de aici, nu o lua de la capăt): ${recent}`,
            ]
              .filter(Boolean)
              .join(' ');
            if (context) controls.sendContextualUpdate(context);
          }
        },
        onDisconnect: () => {
          if (closing.current?.id === id) closing.current.finish();
          else if (valid()) {
            sdkStarted.current = false;
            void stop();
          }
        },
        onModeChange: ({ mode }) => {
          if (mode === 'speaking') {
            lastVoice.current = Date.now();
            lastAgentAt.current = Date.now();
            // FLOW always wins: an instruction that is playing stops at once.
            if (held.current) navigationSpeech.cancel();
          }
          if (valid()) setState(mode === 'speaking' ? 'speaking' : 'listening');
        },
        onMessage: ({ message, role, event_id }) => {
          const who = role === 'user' ? 'user' : 'agent';
          const text = who === 'agent' ? cleanAgentText(message) : message.trim();
          // Noise heard as "..." is neither shown nor treated as the driver talking.
          if (!valid() || !text || isNoise(text)) return;
          const line: TranscriptLine = { id: `${id}-${event_id}`, who, text };
          lastVoice.current = Date.now();
          if (line.who === 'user') lastUserAt.current = Date.now();
          else lastAgentAt.current = Date.now();
          if (line.who === 'user') listeners.current.forEach((listener) => listener(text));
          setTranscript((lines) =>
            lines.some((l) => l.id === line.id && l.who === line.who)
              ? lines
              : [...lines, line].slice(-TRANSCRIPT_LINES),
          );
        },
        onVadScore: ({ vadScore }) => {
          if (vadScore > 0.45) lastVoice.current = Date.now();
          if (valid()) setActivity(Math.max(0, Math.min(1, vadScore)));
        },
        onError: () => {
          if (closing.current?.id === id) closing.current.finish();
          else if (valid()) {
            sdkStarted.current = false;
            fail('Conexiunea vocală s-a întrerupt. Poți reîncerca.');
          }
        },
        onUnhandledClientToolCall: () =>
          fail('Agentul a cerut o comandă care nu este disponibilă în aplicație.'),
      });
    } catch (e) {
      const denied =
        e instanceof DOMException &&
        (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError');
      const missingMic = e instanceof DOMException && e.name === 'NotFoundError';
      fail(
        denied
          ? 'Accesul la microfon a fost refuzat. Permite microfonul din setările site-ului, apoi reîncearcă.'
          : missingMic
            ? 'Nu am găsit niciun microfon. Conectează unul, apoi reîncearcă.'
            : e instanceof VoiceUnavailable && e.reason
              ? e.reason
              : 'FLOW Voice nu este disponibil acum. Poți continua manual și reîncerca.',
      );
    }
  }, [controls.startSession, stop]);
  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(next);
      try {
        window.localStorage.setItem(ENABLED_KEY, next ? '1' : '0');
      } catch {
        /* private mode: the choice holds for this page only */
      }
      if (!next) {
        // Clear an old failure first, so stopping lands on "idle" and turning it on again is clean.
        failure.current = null;
        setError(null);
        void stop();
      }
    },
    [stop],
  );
  const enabledValue = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled]);
  const toggleOutput = () => {
    const next = !outputMuted;
    setOutputMuted(next);
    rawRef.current?.setVolume({ volume: next ? 0 : 1 });
  };
  return (
    <EnabledContext.Provider value={enabledValue}>
    <HeardContext.Provider value={heard.current}>
    <RegistrationContext.Provider value={register}>
      <Context.Provider
        value={{
          transcript,
          state:
            state === 'speaking' || state === 'listening'
              ? isSpeaking
                ? 'speaking'
                : 'listening'
              : state,
          error,
          muted: input.isMuted,
          outputMuted,
          activity,
          start,
          stop,
          toggleMic: () => input.setMuted(!input.isMuted),
          toggleOutput,
          tell: (text: string) => {
            if (state === 'listening' || state === 'speaking') controls.sendContextualUpdate(text);
          },
          register,
        }}
      >
        {children}
      </Context.Provider>
    </RegistrationContext.Provider>
    </HeardContext.Provider>
    </EnabledContext.Provider>
  );
}
/** Calls `listener` with each sentence the driver says to FLOW Voice. */
export function useVoiceHeard(listener: (text: string) => void) {
  const heard = useContext(HeardContext);
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => heard?.subscribe((text) => latest.current(text)), [heard]);
}
/** Tells a connected agent about something the app did; no-op when not connected. */
export function useVoiceTell() {
  return useContext(HeardContext)?.tell ?? (() => {});
}
export function useVoiceRegistration(
  tools: ToolSession,
  begin: () => void,
  summary?: () => string | null,
) {
  const register = useContext(RegistrationContext);
  const latest = useRef(summary);
  latest.current = summary;
  useEffect(
    () => register?.(tools, begin, () => latest.current?.() ?? null),
    [register, tools, begin],
  );
}
/**
 * What FLOW Voice is doing, the conversation and places to tap, shown only while it is in use.
 * The microphone button next to the search starts and stops it; this panel has no controls.
 */
export function VoicePanel({
  environment = 'live',
  choices = [],
  onChoose,
}: {
  environment?: 'live' | 'demo';
  /** Places to tap when a spoken destination matched several. */
  choices?: { id: string; label: string; place: Destination }[];
  onChoose?: (place: Destination) => void;
}) {
  const voice = useContext(Context);
  const { enabled } = useContext(EnabledContext);
  if (!voice || !enabled) return null;
  const connected = voice.state === 'listening' || voice.state === 'speaking';
  const showChoices = choices.length > 0 && !!onChoose;
  if (voice.state === 'idle' && !showChoices) return null;
  const label =
    voice.state === 'connecting'
      ? 'Se conectează…'
      : voice.state === 'disconnecting'
        ? 'Se oprește…'
        : voice.state === 'speaking'
          ? 'Vorbește'
          : connected
            ? 'Ascultă — spune unde vrei să ajungi'
            : voice.state === 'error'
              ? 'Conexiune indisponibilă'
              : 'Oprit';
  return (
    <section className="flow-voice is-compact" aria-label="FLOW Voice" data-state={voice.state}>
      <div className="flow-voice-heading">
        <span
          className="flow-voice-mark"
          aria-hidden="true"
          style={{ opacity: connected && !voice.muted ? 0.55 + voice.activity * 0.45 : 1 }}
        >
          <AudioLines size={17} />
        </span>
        <div>
          <strong>FLOW Voice {environment === 'demo' && <small>DEMO</small>}</strong>
          <span role="status" aria-live="polite">
            {label}
          </span>
        </div>
      </div>
      {connected && voice.transcript.length > 0 && (
        <ol className="flow-voice-transcript" aria-label="Conversația cu FLOW Voice" aria-live="polite">
          {voice.transcript.slice(-4).map((line) => (
            <li key={`${line.who}-${line.id}`} data-who={line.who}>
              <span>{line.who === 'user' ? 'Tu' : 'FLOW'}</span>
              {line.text}
            </li>
          ))}
        </ol>
      )}
      {showChoices && (
        <div className="flow-voice-choices" role="group" aria-label="Alege locația">
          <p>Am găsit mai multe locuri. Atinge-l pe cel corect:</p>
          {choices.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChoose(c.place);
                voice.tell(`Utilizatorul a ales pe ecran destinația: ${c.label}.`);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {voice.error && (
        <p role="alert" className="flow-voice-error">
          {voice.error}
        </p>
      )}
    </section>
  );
}
/** Menu switch: FLOW Voice is optional and off until the user turns it on. */
export function VoiceSetting() {
  const { enabled, setEnabled } = useContext(EnabledContext);
  return (
    <label className="flow-voice-setting">
      <AudioLines aria-hidden="true" />
      <span>
        FLOW Voice · asistent vocal (opțional)
        <small>
          Adaugă un buton de microfon lângă căutare și în navigație. Vocea ajunge la ElevenLabs
          doar după ce apeși pe el.
        </small>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
      />
    </label>
  );
}
/** Round "talk" button for the navigation screen: one tap starts or stops FLOW Voice. */
export function VoiceMicButton({ className = '' }: { className?: string }) {
  const voice = useContext(Context);
  const { enabled } = useContext(EnabledContext);
  if (!voice || !enabled) return null;
  const connected = voice.state === 'listening' || voice.state === 'speaking';
  const busy = voice.state === 'connecting' || voice.state === 'disconnecting';
  return (
    <button
      type="button"
      className={`flow-voice-mic ${className}`}
      data-state={voice.state}
      aria-pressed={connected}
      aria-label={
        connected || busy ? 'Oprește FLOW Voice' : 'Vorbește cu FLOW Voice'
      }
      disabled={voice.state === 'disconnecting'}
      onClick={connected || busy ? voice.stop : voice.start}
    >
      {busy ? (
        <AudioLines size={20} />
      ) : connected || className.includes('is-inline') ? (
        // Next to the search an idle mic reads as "tap to talk", not as "muted".
        <Mic size={20} />
      ) : (
        <MicOff size={20} />
      )}
    </button>
  );
}
/** The last thing said in the conversation (or a voice error), shown briefly over the map. */
export function VoiceBubble() {
  const voice = useContext(Context);
  const { enabled } = useContext(EnabledContext);
  const last = voice?.transcript.at(-1) ?? null;
  const [shown, setShown] = useState<string | null>(null);
  const message = voice?.error ?? (last ? `${last.who}-${last.id}` : null);
  useEffect(() => {
    if (!message) return;
    setShown(message);
    const t = window.setTimeout(() => setShown(null), 6000);
    return () => window.clearTimeout(t);
  }, [message]);
  if (!voice || !enabled || !shown) return null;
  return (
    <p className="flow-voice-bubble" role="status" data-who={voice.error ? 'error' : last?.who}>
      {voice.error ?? (
        <>
          <span>{last?.who === 'user' ? 'Tu' : 'FLOW'}</span> {last?.text}
        </>
      )}
    </p>
  );
}
/**
 * On pages without their own voice controls, a live conversation stays visible as one floating mic,
 * so the driver can always see that FLOW Voice is on and switch it off.
 */
export function VoiceFloating() {
  const voice = useContext(Context);
  const { enabled } = useContext(EnabledContext);
  if (!voice || !enabled || voice.state === 'idle' || voice.state === 'error') return null;
  return (
    <div className="flow-voice-floating">
      <VoiceBubble />
      <VoiceMicButton />
    </div>
  );
}
