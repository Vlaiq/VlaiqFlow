import type { TranscriptLine } from './voiceTypes';

/** Same bound as the account memory (shared VOICE_MEMORY_LINES). */
export const TRANSCRIPT_LINES = 40;
/** How many past lines the agent gets when a conversation starts. */
export const CONTEXT_LINES = 20;
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

/** The account memory and this tab's lines together, oldest first, each line once. */
export function mergeLines(saved: TranscriptLine[], current: TranscriptLine[]): TranscriptLine[] {
  const seen = new Set<string>();
  const all = [...saved, ...current].filter((l) => {
    const key = `${l.who}:${l.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Lines with a time are ordered by it; old lines without one keep their place at the start.
  const time = (l: TranscriptLine) => (l.at ? Date.parse(l.at) : 0);
  return all
    .map((l, i) => ({ l, i }))
    .sort((a, b) => time(a.l) - time(b.l) || a.i - b.i)
    .map(({ l }) => l)
    .slice(-TRANSCRIPT_LINES);
}

/**
 * What FLOW is told when a conversation starts: the last lines, with the day they were said,
 * so it continues like a person who remembers ("data trecută ai vrut la Piața Victoriei").
 */
export function memoryContext(lines: TranscriptLine[], now = new Date()): string | null {
  const recent = lines.slice(-CONTEXT_LINES);
  if (!recent.length) return null;
  const day = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? ''
      : `[${d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', timeZone: 'Europe/Bucharest' })}] `;
  };
  const text = recent
    .map((l) => `${day(l.at)}${l.who === 'user' ? 'Șoferul' : 'FLOW'}: ${l.text}`)
    .join(' | ');
  return `Ce ați vorbit până acum (ține minte și continuă de aici, nu o lua de la capăt; nu repeta salutul dacă v-ați mai auzit): ${text}`;
}

/** Voice-style tags the agent speaks with ("[happy]", "[calm]") are not part of the text. */
export const cleanAgentText = (text: string) =>
  text.replace(/\[[a-z][a-z _-]{1,24}\]\s*/gi, '').trim();

/** Speech recognised as noise ("...", "?!") is not something the driver said: no letter or digit. */
export const isNoise = (text: string) => !/[\p{L}\p{N}]/u.test(text);
