import { describe, expect, it } from 'vitest';
import { cleanAgentText, isNoise, memoryContext, mergeLines, TRANSCRIPT_LINES } from './voiceText';
import type { TranscriptLine } from './voiceTypes';

const line = (id: string, who: 'user' | 'agent', text: string, at?: string): TranscriptLine => ({
  id,
  who,
  text,
  ...(at ? { at } : {}),
});

describe('FLOW Voice memory', () => {
  it('merges the account memory with this tab once per line, in time order, bounded', () => {
    const saved = [line('a-1', 'user', 'Vreau la gară', '2026-11-14T08:00:00Z')];
    const tab = [
      line('a-1', 'user', 'Vreau la gară', '2026-11-14T08:00:00Z'),
      line('b-1', 'agent', 'Pornim', '2026-11-15T09:00:00Z'),
    ];
    expect(mergeLines(saved, tab).map((l) => l.id)).toEqual(['a-1', 'b-1']);
    const many = Array.from({ length: 60 }, (_, i) =>
      line(`m-${i}`, 'user', 'Da', new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString()),
    );
    const merged = mergeLines(many, []);
    expect(merged).toHaveLength(TRANSCRIPT_LINES);
    expect(merged.at(-1)!.id).toBe('m-59');
  });
  it('tells FLOW what was said, with the day for older conversations', () => {
    const now = new Date('2026-11-15T12:00:00Z');
    const text = memoryContext(
      [
        line('a-1', 'user', 'Vreau la Piața Victoriei', '2026-11-14T08:00:00Z'),
        line('b-1', 'agent', 'Am găsit trei parcări', '2026-11-15T11:00:00Z'),
      ],
      now,
    )!;
    expect(text).toContain('[14 noiembrie] Șoferul: Vreau la Piața Victoriei');
    expect(text).toContain('| FLOW: Am găsit trei parcări');
    expect(text).toContain('nu o lua de la capăt');
    expect(memoryContext([], now)).toBeNull();
  });
});

describe('voice transcript text', () => {
  it('keeps real Romanian sentences, including ones without p, L or N', () => {
    // Regression: the character class had lost its backslashes and only matched "p", "L", "N", "{", "}".
    for (const text of ['Mergi la gară', 'hai să mergem', 'Da', 'Piața Victoriei', '12'])
      expect(isNoise(text)).toBe(false);
  });
  it('treats punctuation-only recognition as noise', () => {
    for (const text of ['...', '?!', '…', ' - ']) expect(isNoise(text)).toBe(true);
  });
  it('removes voice-style tags but keeps the words and brackets that are not tags', () => {
    expect(cleanAgentText('[happy] Am găsit trei parcări.')).toBe('Am găsit trei parcări.');
    expect(cleanAgentText('[calm]  Pornim.')).toBe('Pornim.');
    expect(cleanAgentText('Parcarea [P1] e liberă')).toBe('Parcarea [P1] e liberă');
    expect(cleanAgentText('Mergem pe jos.')).toBe('Mergem pe jos.');
  });
});
