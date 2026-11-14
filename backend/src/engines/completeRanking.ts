import {
  type CompleteJourney,
  type CompleteJourneyResponse,
  type JourneyPreference,
} from '@vlaiq/shared';
/** Prototype policy: elapsed overhead and mixed/unknown costs are never optimized as zero. */
export function rankCompleteJourneys(
  journeys: CompleteJourney[],
): CompleteJourneyResponse['rankings'] {
  const byTime = [...journeys].sort(
    (a, b) => a.travelSeconds.value! - b.travelSeconds.value! || a.id.localeCompare(b.id),
  );
  const quickest = byTime[0];
  const active = byTime.filter((j) => j.category !== 'car_park_walk' && j.practical);
  const picks = {
    fastest: quickest,
    balanced:
      active.find((j) => j.travelSeconds.value! <= (quickest?.travelSeconds.value ?? 0) + 300) ??
      quickest,
    green: active[0] ?? quickest,
  };
  const explanations: Record<JourneyPreference, string> = {
    fastest: 'Cel mai scurt timp calculat pe trasee. Căutarea parcării nu este inclusă.',
    balanced:
      'Preferăm mersul activ dacă adaugă cel mult 5 minute față de cea mai rapidă variantă calculată. Prag de prototip; costurile incomplete nu sunt optimizate.',
    green:
      'Preferăm o variantă activă practică: maximum 35 min pe jos sau 45 min cu bicicleta. Nu cuantificăm emisii evitate.',
  };
  return Object.fromEntries(
    (['fastest', 'balanced', 'green'] as const).map((p) => {
      const pick = picks[p];
      return [
        p,
        {
          ids: pick ? [pick.id, ...byTime.filter((j) => j.id !== pick.id).map((j) => j.id)] : [],
          recommendedId: pick?.id ?? null,
          explanation: explanations[p],
        },
      ];
    }),
  ) as CompleteJourneyResponse['rankings'];
}
