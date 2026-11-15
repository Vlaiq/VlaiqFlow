/**
 * FLOW Voice engine (ElevenLabs + LiveKit, ~640 KB). Loaded only while FLOW Voice is turned on in
 * the menu, so the first page load does not download it. Rendered beside the app by
 * FlowVoiceProvider; it publishes its state through the bridge instead of wrapping the app.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ConversationProvider,
  useConversationControls,
  useConversationInput,
  useConversationMode,
  useRawConversation,
} from '@elevenlabs/react';
import { z } from 'zod';
import { useIdentity } from '../identity/IdentityProvider';
import { accountCall, privateFetch } from '../identity/privateApi';
import { voicePersonalization } from '../../../../shared/src/identity';
import { FLOW_AGENT } from '../../../../shared/src/flowVoice';
import { useAppRouter } from '../../app/router';
import { navigationSpeech, registerConversationGate } from './speech';
import {
  TRANSCRIPT_KEY,
  TRANSCRIPT_LINES,
  cleanAgentText,
  isNoise,
  loadTranscript,
  memoryContext,
  mergeLines,
} from './voiceText';
import type {
  ToolSession,
  TranscriptLine,
  VoiceBridge,
  VoiceContextValue,
  VoiceState,
} from './voiceTypes';

/** The session endpoint refused; `reason` is the server's user-facing message, if it sent one. */
class VoiceUnavailable extends Error {
  constructor(readonly reason: string | null) {
    super('SERVICE_UNAVAILABLE');
  }
}

export default function VoiceRuntime({ bridge }: { bridge: VoiceBridge }) {
  return (
    <ConversationProvider>
      <Runtime bridge={bridge} />
    </ConversationProvider>
  );
}

function Runtime({ bridge }: { bridge: VoiceBridge }) {
  const identity = useIdentity();
  const controls = useConversationControls();
  const raw = useRawConversation();
  const rawRef = useRef(raw);
  rawRef.current = raw;
  const input = useConversationInput();
  const { isSpeaking } = useConversationMode();
  const { navigate } = useAppRouter();
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [outputMuted, setOutputMuted] = useState(false);
  const [activity, setActivity] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptLine[]>(loadTranscript);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  useEffect(() => {
    try {
      window.sessionStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(transcript));
    } catch {
      /* private mode: the conversation still shows for this page */
    }
  }, [transcript]);
  // Long memory: with the voice consent from Settings, the conversation is kept in the FLOW account
  // (PostgreSQL), so FLOW remembers it on another day or device. Without consent: this tab only.
  const memoryOn = identity.authenticated && identity.profile?.voiceConsent === true;
  const memoryReady = useRef(false);
  useEffect(() => {
    memoryReady.current = false;
    if (!memoryOn) return;
    let alive = true;
    void accountCall('/me/voice-memory')
      .then((body: { lines?: TranscriptLine[] }) => {
        if (!alive) return;
        const saved = Array.isArray(body?.lines) ? body.lines : [];
        setTranscript((current) => mergeLines(saved, current));
        memoryReady.current = true;
      })
      .catch(() => {
        /* Account memory unavailable: FLOW still remembers this tab. */
      });
    return () => {
      alive = false;
    };
  }, [memoryOn, identity.accountKey]);
  useEffect(() => {
    if (!memoryOn || !memoryReady.current) return;
    const timer = setTimeout(() => {
      void accountCall('/me/voice-memory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: transcript.slice(-TRANSCRIPT_LINES) }),
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [transcript, memoryOn]);
  const registration = bridge.registration;
  const active = useRef<{ id: number; controller: AbortController; tools: ToolSession } | null>(
    null,
  );
  const generation = useRef(0);
  const sdkStarted = useRef(false);
  const closing = useRef<{ id: number; promise: Promise<void>; finish: () => void } | null>(null);
  const failure = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(true);
  const stateRef = useRef<VoiceState>('idle');
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
  // The app tells a connected agent what happened on screen; no-op when not connected.
  useEffect(() => {
    bridge.setTell((text) => {
      if (stateRef.current === 'listening' || stateRef.current === 'speaking')
        controlsRef.current.sendContextualUpdate(text);
    });
    return () => bridge.setTell(null);
  }, [bridge]);
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
    // This engine only runs while the menu switch is on; FLOW Voice also needs a FLOW account (Auth0).
    if (!identity.authenticated) {
      navigate('/profile');
      return;
    }
    if (active.current || closing.current || !registration.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Microfonul necesită HTTPS și un browser compatibil.');
      setState('error');
      return;
    }
    const entry = registration.current;
    const id = ++generation.current;
    const sessionTag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
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
      const response = await privateFetch(`${base}/api/flow-voice/session`, {
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
            const personal = voicePersonalization(identity.profile);
            // Data-only context: the pinned agent forbids first-message overrides.
            if (personal) controls.sendContextualUpdate(JSON.stringify({ user_profile: { preferred_name: personal.nickname }, voice_personalization_consent: true }));
            const summary = registration.current?.summary?.();
            // What was said before (this tab, or the account memory with consent), like a person
            // who remembers the last conversation.
            const recent = memoryContext(transcriptRef.current);
            const context = [summary, recent].filter(Boolean).join(' ');
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
          // A random session tag: lines kept in the account never collide with a later session.
          const line: TranscriptLine = {
            id: `${sessionTag}-${event_id}`,
            who,
            text: text.slice(0, 600),
            at: new Date().toISOString(),
          };
          lastVoice.current = Date.now();
          if (line.who === 'user') lastUserAt.current = Date.now();
          else lastAgentAt.current = Date.now();
          if (line.who === 'user') bridge.emitHeard(text);
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
  }, [controls.startSession, stop, identity.profile, identity.authenticated, navigate]);
  const toggleOutput = () => {
    const next = !outputMuted;
    setOutputMuted(next);
    rawRef.current?.setVolume({ volume: next ? 0 : 1 });
  };
  const value: VoiceContextValue = {
    transcript,
    state:
      state === 'speaking' || state === 'listening' ? (isSpeaking ? 'speaking' : 'listening') : state,
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
    register: bridge.register,
  };
  // The provider re-renders the voice UI with the latest state; it does not re-render this engine.
  useLayoutEffect(() => bridge.publish(value));
  useEffect(() => () => bridge.publish(null), [bridge]);
  return null;
}
