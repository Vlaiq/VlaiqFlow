import type {
  CompleteJourney,
  CompleteJourneyResponse,
} from './schemas/completeJourney';

export function walkingSeconds(j: CompleteJourney): number | null {
  const legs = j.legs.filter((l) => l.type === 'walk');
  return legs.some((l) => l.duration.value === null)
    ? null
    : legs.reduce((n, l) => n + l.duration.value!, 0);
}

/** Filter the compared set only. Never infer a missing route or round before applying a limit. */
export function constrainComparison(
  value: CompleteJourneyResponse,
  maxWalking: number,
): CompleteJourneyResponse {
  const journeys = value.journeys.filter(
    (j) => (walkingSeconds(j) ?? Infinity) <= maxWalking * 60,
  );
  const ids = new Set(journeys.map((j) => j.id));
  return {
    ...value,
    journeys,
    rankings: Object.fromEntries(
      Object.entries(value.rankings).map(([k, r]) => [
        k,
        {
          ...r,
          ids: r.ids.filter((id) => ids.has(id)),
          recommendedId: r.ids.find((id) => ids.has(id)) ?? null,
        },
      ]),
    ) as CompleteJourneyResponse['rankings'],
    opportunity:
      value.opportunity && ids.has(value.opportunity.journeyId)
        ? value.opportunity
        : null,
    unavailable: [
      ...value.unavailable,
      ...(['car_park_walk', 'walk', 'cycle'] as const)
        .filter(
          (category) =>
            value.journeys.some((j) => j.category === category) &&
            !journeys.some((j) => j.category === category),
        )
        .map((category) => ({
          category,
          reason: `Nicio rută calculată nu respectă limita de ${maxWalking} minute pe jos.`,
        })),
    ],
  };
}
