import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
import { Mic, MicOff, Volume2, VolumeX, Square, AudioLines, RotateCcw } from 'lucide-react';
import { z } from 'zod';
import { FLOW_AGENT } from '../../../../shared/src/flowVoice';
import { useAppRouter } from '../../app/router';
import { registerConversationStop } from './speech';
import './voice.css';

interface ToolSession {
  handlers(): Record<string, (input: Record<string, unknown>) => Promise<string>>;
  end(): void;
}
type State = 'idle' | 'connecting' | 'listening' | 'speaking' | 'disconnecting' | 'error';
interface VoiceContextValue {
  state: State;
  error: string | null;
  muted: boolean;
  outputMuted: boolean;
  activity: number;
  start(): void;
  stop(): void;
  toggleMic(): void;
  toggleOutput(): void;
  register(tools: ToolSession, begin: () => void): () => void;
}
const Context = createContext<VoiceContextValue | null>(null);
// Planner registration must not subscribe the map subtree to high-frequency VAD/UI updates.
const RegistrationContext = createContext<VoiceContextValue['register'] | null>(null);
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
  const { location } = useAppRouter();
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);
  const [outputMuted, setOutputMuted] = useState(false);
  const [activity, setActivity] = useState(0);
  const registration = useRef<{ tools: ToolSession; begin: () => void } | null>(null);
  const active = useRef<{ id: number; controller: AbortController; tools: ToolSession } | null>(
    null,
  );
  const generation = useRef(0);
  const sdkStarted = useRef(false);
  const closing = useRef<{ id: number; promise: Promise<void>; finish: () => void } | null>(null);
  const failure = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(true);
  const register = useCallback((tools: ToolSession, begin: () => void) => {
    const entry = { tools, begin };
    registration.current = entry;
    return () => {
      tools.end();
      if (registration.current === entry) registration.current = null;
    };
  }, []);
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
  useEffect(
    () =>
      registerConversationStop(async () => {
        const conversation = rawRef.current;
        if (!active.current && !conversation) return;
        conversation?.setVolume({ volume: 0 });
        // endSession returns a Promise on the raw instance; granular controls intentionally return void.
        await stop();
        if (mounted.current)
          setError('Navigatorul a preluat vocea. Poți reporni copilotul când dorești.');
      }),
    [stop],
  );
  useEffect(() => {
    stop();
  }, [location.pathname, location.search, stop]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop();
    };
  }, [stop]);
  const start = useCallback(async () => {
    if (active.current || closing.current || !registration.current) return;
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
      if (!response.ok) throw new Error('SERVICE_UNAVAILABLE');
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
            setState('listening');
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
          if (valid()) setState(mode === 'speaking' ? 'speaking' : 'listening');
        },
        onVadScore: ({ vadScore }) => {
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
      fail(
        denied
          ? 'Accesul la microfon a fost refuzat. Permite microfonul din setările site-ului, apoi reîncearcă.'
          : 'FLOW Voice nu este disponibil acum. Poți continua manual și reîncerca.',
      );
    }
  }, [controls.startSession, stop]);
  const toggleOutput = () => {
    const next = !outputMuted;
    setOutputMuted(next);
    rawRef.current?.setVolume({ volume: next ? 0 : 1 });
  };
  return (
    <RegistrationContext.Provider value={register}>
      <Context.Provider
        value={{
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
          register,
        }}
      >
        {children}
      </Context.Provider>
    </RegistrationContext.Provider>
  );
}
export function useVoiceRegistration(tools: ToolSession, begin: () => void) {
  const register = useContext(RegistrationContext);
  useEffect(() => register?.(tools, begin), [register, tools, begin]);
}
export function VoiceCard({
  compact = false,
  environment = 'live',
}: {
  compact?: boolean;
  environment?: 'live' | 'demo';
}) {
  const voice = useContext(Context);
  if (!voice) return null;
  const connected = voice.state === 'listening' || voice.state === 'speaking';
  const busy = voice.state === 'connecting' || voice.state === 'disconnecting';
  const label =
    voice.state === 'connecting'
      ? 'Se conectează…'
      : voice.state === 'disconnecting'
        ? 'Se oprește…'
        : voice.state === 'speaking'
          ? 'Vorbește'
          : connected
            ? voice.muted
              ? 'Microfon oprit'
              : 'Ascultă'
            : voice.state === 'error'
              ? 'Conexiune indisponibilă'
              : 'Spune unde vrei să ajungi';
  return (
    <section
      className={`flow-voice ${compact ? 'is-compact' : ''}`}
      aria-label="FLOW Voice"
      data-state={voice.state}
    >
      <div className="flow-voice-heading">
        <span
          className="flow-voice-mark"
          aria-hidden="true"
          style={{ opacity: connected && !voice.muted ? 0.55 + voice.activity * 0.45 : 1 }}
        >
          <AudioLines size={21} />
        </span>
        <div>
          <strong>FLOW Voice {environment === 'demo' && <small>DEMO</small>}</strong>
          <span role="status" aria-live="polite">
            {label}
          </span>
        </div>
        <button
          className="flow-voice-primary"
          disabled={busy && voice.state === 'disconnecting'}
          onClick={connected || busy ? voice.stop : voice.start}
          aria-label={connected || busy ? 'Oprește FLOW Voice' : 'Pornește FLOW Voice'}
        >
          {connected || busy ? (
            <Square size={17} />
          ) : voice.state === 'error' ? (
            <RotateCcw size={19} />
          ) : (
            <Mic size={19} />
          )}
          <span>{connected || busy ? 'Oprește' : 'Pornește'}</span>
        </button>
      </div>
      {connected && (
        <div className="flow-voice-controls">
          <button
            onClick={voice.toggleMic}
            aria-pressed={voice.muted}
            aria-label={
              voice.muted ? 'Activează microfonul FLOW Voice' : 'Oprește microfonul FLOW Voice'
            }
          >
            {voice.muted ? <MicOff size={17} /> : <Mic size={17} />} Microfon
          </button>
          <button
            onClick={voice.toggleOutput}
            aria-pressed={voice.outputMuted}
            aria-label={
              voice.outputMuted ? 'Activează redarea copilotului' : 'Oprește redarea copilotului'
            }
          >
            {voice.outputMuted ? <VolumeX size={17} /> : <Volume2 size={17} />} Redare
          </button>
        </div>
      )}
      {voice.error && (
        <p role="alert" className="flow-voice-error">
          {voice.error}
        </p>
      )}
      {!compact && !connected && (
        <p className="flow-voice-consent">
          La pornire, vocea și contextul minim al călătoriei ajung la ElevenLabs.{' '}
          <a href="/confidentialitate">Detalii</a>
        </p>
      )}
    </section>
  );
}
