// SYNTHETIC SDK ONLY FOR scripts/test-flow-voice-session-browser.cjs. Never imported by production.
import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
const Context = createContext(null);
export function ConversationProvider({ children }) {
  const [raw, setRaw] = useState(null),
    [muted, setMutedState] = useState(false),
    [mode, setMode] = useState('listening');
  const current = useRef(null),
    last = useRef(null);
  const stats = useMemo(
    () => ({
      starts: 0,
      ends: 0,
      volumes: [],
      microphones: [],
      options: null,
      speak: () => {
        setMode('speaking');
        last.current?.onModeChange({ mode: 'speaking' });
      },
      fail: () => last.current?.onError('SYNTHETIC SDK ERROR'),
      lateError: null,
    }),
    [],
  );
  Object.assign(window, { sdkMock: stats });
  const controls = useMemo(
    () => ({
      startSession(options) {
        setMode('listening');
        stats.starts++;
        stats.options = options;
        last.current = options;
        stats.lateError = options.onError;
        const conversation = {
          setVolume({ volume }) {
            stats.volumes.push(volume);
          },
          async endSession() {
            if (current.current !== conversation) return;
            stats.ends++;
            current.current = null;
            await new Promise((r) => setTimeout(r, 40));
            setRaw(null);
            setMutedState(false);
            setMode('listening');
            options.onDisconnect();
          },
        };
        current.current = conversation;
        setTimeout(() => {
          if (current.current === conversation) {
            setRaw(conversation);
            options.onConnect();
          }
        }, 30);
      },
      endSession() {
        return current.current?.endSession();
      },
    }),
    [],
  );
  return (
    <Context.Provider
      value={{
        controls,
        raw,
        mode,
        muted,
        setMuted: (value) => {
          if (!current.current) throw new Error('No active conversation.');
          stats.microphones.push(value);
          setMutedState(value);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useConversationControls = () => useContext(Context).controls;
export const useConversationInput = () => {
  const c = useContext(Context);
  return { isMuted: c.muted, setMuted: c.setMuted };
};
export const useConversationMode = () => ({ isSpeaking: useContext(Context).mode === 'speaking' });
export const useRawConversation = () => useContext(Context).raw;
