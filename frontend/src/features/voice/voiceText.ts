import type { TranscriptLine } from './voiceTypes';

export const TRANSCRIPT_LINES = 12;
export const TRANSCRIPT_KEY = 'vlaiq-voice-transcript';

/** The conversation survives page changes and reloads in this browser tab (sessionStorage only). */
export function loadTranscript(): TranscriptLine[] {
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
export const cleanAgentText = (text: string) =>
  text.replace(/\[[a-z][a-z _-]{1,24}\]\s*/gi, '').trim();

/** Speech recognised as noise ("...", "?!") is not something the driver said: no letter or digit. */
export const isNoise = (text: string) => !/[\p{L}\p{N}]/u.test(text);
