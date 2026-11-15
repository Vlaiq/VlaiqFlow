/** Types shared by the always-loaded voice UI and the voice engine loaded only when FLOW Voice is on. */
export interface ToolSession {
  handlers(): Record<string, (input: Record<string, unknown>) => Promise<string>>;
  end(): void;
}
export type VoiceState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'disconnecting' | 'error';
/** One line of the conversation, kept only in this browser tab. */
export interface TranscriptLine {
  /** Session and event, so lines from different sessions never collide. */
  id: string;
  who: 'user' | 'agent';
  text: string;
  /** When it was said (ISO). Older lines kept before 15 Nov have none. */
  at?: string;
}
export interface VoiceContextValue {
  state: VoiceState;
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
export interface Registration {
  tools: ToolSession;
  begin: () => void;
  summary?: () => string | null;
}
/** How the lazily loaded engine talks to the provider that is always mounted. */
export interface VoiceBridge {
  registration: { current: Registration | null };
  /** A sentence the driver said, for the app's own reactions ("hai să mergem"). */
  emitHeard(text: string): void;
  setTell(tell: ((text: string) => void) | null): void;
  publish(value: VoiceContextValue | null): void;
  register: VoiceContextValue['register'];
}
