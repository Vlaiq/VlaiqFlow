import { describe, expect, it } from 'vitest';
import { cleanAgentText, isNoise } from './voiceText';

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
