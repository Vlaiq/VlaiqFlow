import { z } from 'zod';
import {
  CompleteJourneyRequest,
  CompleteJourneyResponse,
} from './schemas/completeJourney';

export const JourneyReference = z
  .object({ id: z.string().uuid(), revision: z.string().uuid() })
  .strict();
export type JourneyReference = z.infer<typeof JourneyReference>;
export const JourneySnapshot = z.object({
  input: CompleteJourneyRequest,
  value: CompleteJourneyResponse,
});
export type JourneySnapshot = z.infer<typeof JourneySnapshot>;
export const JourneyQuestion = z
  .object({
    reference: JourneyReference,
    question: z.string().trim().min(1).max(300),
  })
  .strict();
export const JourneySelection = z
  .object({ reference: JourneyReference, optionId: z.string().min(1).max(200) })
  .strict();
export type JourneySelection = z.infer<typeof JourneySelection>;
export const JourneyExplanation = z.object({
  reference: JourneyReference,
  maxWalkMinutes: z.number().int().min(0).max(180),
  eligibleIds: z.array(z.string()),
  optionId: z.string().nullable(),
  text: z.string(),
  source: z.enum(['gemini', 'deterministic']),
  snapshot: JourneySnapshot,
});
export type JourneyExplanation = z.infer<typeof JourneyExplanation>;

/** Supported intent is deliberately explicit; the language model never interprets constraints. */
export function walkingLimit(question: string): number | null {
  const q = question
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  const match = q.match(
    /(?:cel mult|maximum|maxim|limita de)\s+(-?\d+(?:[.,]\d+)?)\s*(?:minute|min)\b/,
  );
  if (!match || !/pe jos/.test(q)) return null;
  const n = Number(match[1]!.replace(',', '.'));
  return Number.isInteger(n) && n >= 0 && n <= 180 ? n : null;
}
