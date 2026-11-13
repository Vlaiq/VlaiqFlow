import { z } from 'zod';
import { Coordinate, NavigationRoute } from './navigation';

export const JourneyMode = z.enum(['drive', 'walk', 'cycle']);
export type JourneyMode = z.infer<typeof JourneyMode>;
export const JourneyPreference = z.enum(['fastest', 'balanced', 'green']);
export type JourneyPreference = z.infer<typeof JourneyPreference>;
export const JourneyComparisonRequest = z
  .object({ origin: Coordinate, destination: Coordinate })
  .strict();
export type JourneyComparisonRequest = z.infer<typeof JourneyComparisonRequest>;
export const JourneyOption = z.object({
  id: z.string(),
  mode: JourneyMode,
  route: NavigationRoute.refine(
    (r) => Number.isFinite(r.distance) && Number.isFinite(r.duration),
    'Finite route metrics required',
  ),
  practical: z.boolean(),
  note: z.string(),
});
export type JourneyOption = z.infer<typeof JourneyOption>;
export const FlowOpportunity = z.object({
  optionId: z.string(),
  mode: z.enum(['walk', 'cycle']),
  extraSeconds: z.number().finite(),
  activeMeters: z.number().finite().positive(),
  explanation: z.string(),
});
export type FlowOpportunity = z.infer<typeof FlowOpportunity>;
export const JourneyComparisonResponse = z.object({
  options: z.array(JourneyOption).max(3),
  unavailable: z.array(z.object({ mode: JourneyMode, reason: z.string() })).max(3),
  opportunity: FlowOpportunity.nullable(),
  fetchedAt: z.string().datetime(),
  coverage: z.string(),
});
export type JourneyComparisonResponse = z.infer<typeof JourneyComparisonResponse>;

/** Prototype practicality limits, not safety assessments or scientific emission estimates. */
export const JOURNEY_LIMITS = {
  walkSeconds: 35 * 60,
  cycleSeconds: 45 * 60,
  opportunityExtraSeconds: 15 * 60,
} as const;

export function journeyPractical(mode: JourneyMode, duration: number): boolean {
  return (
    mode === 'drive' ||
    duration <= (mode === 'walk' ? JOURNEY_LIMITS.walkSeconds : JOURNEY_LIMITS.cycleSeconds)
  );
}

export function findFlowOpportunity(options: JourneyOption[]): FlowOpportunity | null {
  const drive = options.find((option) => option.mode === 'drive');
  if (!drive) return null;
  const active = options.filter(
    (option) =>
      option.mode !== 'drive' &&
      option.practical &&
      option.route.duration - drive.route.duration <= JOURNEY_LIMITS.opportunityExtraSeconds,
  );
  const best =
    active.find((option) => option.mode === 'walk' && option.route.duration <= 20 * 60) ??
    active.find((option) => option.mode === 'cycle') ??
    active[0];
  if (!best || best.mode === 'drive') return null;
  const extraSeconds = Math.round(best.route.duration - drive.route.duration);
  return {
    optionId: best.id,
    mode: best.mode,
    extraSeconds,
    activeMeters: Math.round(best.route.distance),
    explanation: `${best.mode === 'walk' ? 'Poți face acest drum și pe jos.' : 'Poți face acest drum și cu bicicleta.'} Comparație între rute calculate; timpul de căutare a parcării nu este inclus.`,
  };
}

export function chooseJourney(
  options: JourneyOption[],
  preference: JourneyPreference,
): JourneyOption | undefined {
  if (options.length === 0) return undefined;
  const byDuration = [...options].sort((a, b) => a.route.duration - b.route.duration);
  if (preference === 'fastest') return byDuration[0];
  const active = byDuration.filter((option) => option.mode !== 'drive' && option.practical);
  if (preference === 'green') return active[0] ?? byDuration[0];
  const quickest = byDuration[0]!;
  return (
    active.find((option) => option.route.duration - quickest.route.duration <= 5 * 60) ?? quickest
  );
}
