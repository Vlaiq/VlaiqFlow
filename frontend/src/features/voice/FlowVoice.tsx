import {
  Component,
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Mic, MicOff, AudioLines } from 'lucide-react';
import type { Destination } from '@vlaiq/shared';
import type { Registration, ToolSession, VoiceBridge, VoiceContextValue } from './voiceTypes';
import './voice.css';

export type { TranscriptLine } from './voiceTypes';

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

/** The ElevenLabs/LiveKit engine, downloaded only when FLOW Voice is turned on. */
const VoiceRuntime = lazy(() => import('./voiceRuntime'));
/** If the engine cannot load (offline, blocked), FLOW Voice stays off; the app keeps working. */
class VoiceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function FlowVoiceProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(loadEnabled);
  const [voice, setVoice] = useState<VoiceContextValue | null>(null);
  const registration = useRef<Registration | null>(null);
  const listeners = useRef(new Set<(text: string) => void>());
  const tellRef = useRef<((text: string) => void) | null>(null);
  // Registration lives here, so the planner registers once at mount, before the engine loads.
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
  const heard = useRef<Heard>({
    subscribe: (listener) => {
      listeners.current.add(listener);
      return () => listeners.current.delete(listener);
    },
    tell: (text) => tellRef.current?.(text),
  }).current;
  const bridge = useRef<VoiceBridge>({
    registration,
    emitHeard: (text) => listeners.current.forEach((listener) => listener(text)),
    setTell: (tell) => {
      tellRef.current = tell;
    },
    publish: setVoice,
    register,
  }).current;
  const setEnabled = useCallback((next: boolean) => {
    // Turning it off unmounts the engine, which ends any live session.
    setEnabledState(next);
    if (!next) setVoice(null);
    try {
      window.localStorage.setItem(ENABLED_KEY, next ? '1' : '0');
    } catch {
      /* private mode: the choice holds for this page only */
    }
  }, []);
  const enabledValue = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled]);
  // Same element while the switch does not change: the engine re-renders only from its own state.
  const engine = useMemo(
    () =>
      enabled ? (
        <VoiceBoundary>
          <Suspense fallback={null}>
            <VoiceRuntime bridge={bridge} />
          </Suspense>
        </VoiceBoundary>
      ) : null,
    [enabled, bridge],
  );
  return (
    <EnabledContext.Provider value={enabledValue}>
      <HeardContext.Provider value={heard}>
        <RegistrationContext.Provider value={register}>
          <Context.Provider value={enabled ? voice : null}>
            {children}
            {engine}
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
