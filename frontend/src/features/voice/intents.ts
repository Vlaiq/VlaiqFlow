import { normalize } from '@vlaiq/shared';
import type { Mode } from '../../../../shared/src/flowVoice';

/**
 * What the driver said, read deterministically from their own transcript (never from the agent):
 * a travel mode they want ("doar cu mașina") and/or permission to start ("hai să mergem").
 * The agent still answers; these only make the app act on the driver's words without a tap.
 */
export interface SpokenIntent {
  mode: Mode | null;
  go: boolean;
}

const MODES: [Mode, RegExp][] = [
  ['driving', /\b(?:cu (?:masina|masinuta|autoturismul|autoturism)|doar masina|numai masina|condus|la volan)\b/],
  ['cycling', /\b(?:cu (?:bicicleta|bicla|bicicleta mea)|pe bicicleta|doar bicicleta|numai bicicleta)\b/],
  ['walking', /\b(?:pe jos|la pas|mers pe jos|doar pe jos|numai pe jos)\b/],
];
const GO =
  /\b(?:hai sa (?:mergem|plecam|pornim)|sa mergem|mergem|plecam|pornim|porneste (?:navigatia|ruta|traseul|drumul)|incepe navigatia|start navigatie|du ma acolo|condu ma|da porneste)\b/;
// "nu mergem", "nu pornim", "nu încă" must never start anything.
const NEGATION = /\b(?:nu|inca nu|nu inca|stai|asteapta|opreste)\b/;

export function readIntent(text: string): SpokenIntent {
  const t = normalize(text);
  const said = MODES.filter(([, re]) => re.test(t)).map(([m]) => m);
  return {
    // Two modes in one sentence ("cu mașina sau cu bicicleta") is a question, not a choice.
    mode: said.length === 1 ? said[0]! : null,
    go: GO.test(t) && !NEGATION.test(t),
  };
}
