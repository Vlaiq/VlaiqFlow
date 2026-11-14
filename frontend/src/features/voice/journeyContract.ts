import {
  buildSearchIndex,
  searchDestinations,
  normalize,
  type CompleteJourney,
  type CompleteJourneyResponse,
  type Destination,
} from '@vlaiq/shared';
import type {
  Comparison,
  Environment,
  Journey,
  Mode,
  Preferences,
} from '../../../../shared/src/flowVoice';
import { FlowError } from './tools';

export const categoryMode = {
  car_park_walk: 'driving',
  walk: 'walking',
  cycle: 'cycling',
} as const;
export const modeCategory = {
  driving: 'car_park_walk',
  walking: 'walk',
  cycling: 'cycle',
} as const;
/** Spoken words around a place name ("până la", "spre", "din Timișoara") that are not part of it. */
const SPOKEN_LEAD = /^(?:(?:vreau sa merg|vreau sa ajung|du ma|mergem|merg)\s+)?(?:pana la|catre|spre|la|in|pe)\s+/;
const SPOKEN_TAIL = /\s+(?:din |in )?timisoara$/;
export function spokenPlace(text: string): string {
  const cleaned = normalize(text).replace(SPOKEN_LEAD, '').replace(SPOKEN_TAIL, '').trim();
  return cleaned || normalize(text);
}
export function resolvePlace(text: string, destinations: Destination[]): Destination {
  const query = spokenPlace(text);
  const exact = destinations.filter((d) =>
    [d.name, `${d.name}${d.detail ? ` · ${d.detail}` : ''}`, ...(d.aliases ?? [])].some(
      (label) => normalize(label) === normalize(text) || normalize(label) === query,
    ),
  );
  const found = exact.length ? exact : searchDestinations(buildSearchIndex(destinations), query, 6);
  // One result that holds every spoken word as a whole word of its name is the place that was meant
  // ("piata victoriei" → Piața Victoriei, not "Strada Victoriei…"). Ties still go back to the user.
  const words = query.split(' ').filter(Boolean);
  const whole = found.filter((d) => {
    const tokens = normalize(d.name).split(' ');
    return words.every((w) => tokens.includes(w));
  });
  // With several such names, only those are real options; partial hits would just be noise.
  const matches = !exact.length && whole.length >= 1 ? whole : found;
  // Identical municipal/OSM records at the same point represent one place; distinct candidates need consent.
  const unique = matches.filter(
    (d, i) =>
      matches.findIndex(
        (x) =>
          normalize(x.name) === normalize(d.name) &&
          JSON.stringify(x.location) === JSON.stringify(d.location),
      ) === i,
  );
  if (!unique.length) throw new FlowError('NO_MATCH', 'Nu am găsit locația în sursele aplicației.');
  if (unique.length > 1)
    throw new FlowError(
      'AMBIGUOUS_LOCATION',
      'Alege locația exactă din rezultate.',
      unique.map((d) => ({ label: `${d.name}${d.detail ? ` · ${d.detail}` : ''}` })),
    );
  if (!unique[0]!.location)
    throw new FlowError('NO_ROUTE', 'Locația nu are o poziție verificată pentru rutare.');
  return unique[0]!;
}
export function contractJourney(j: CompleteJourney): Journey {
  const walking = j.legs
    .filter((l) => l.type === 'walk')
    .reduce((n, l) => n + (l.duration.value ?? 0), 0);
  const p = j.parking;
  return {
    journey_id: j.id,
    journey_mode: categoryMode[j.category],
    // Includes every movement leg. Parking search/manoeuvre overhead remains explicitly unknown.
    duration_minutes: j.travelSeconds.value === null ? null : j.travelSeconds.value / 60,
    distance_meters: j.distance.value,
    walking_minutes: walking / 60,
    parking: p
      ? {
          name: p.name,
          cost:
            p.fee.minorUnits === null || !p.fee.currency
              ? null
              : { amount: p.fee.minorUnits / 100, currency: p.fee.currency, kind: 'estimated' },
          availability: { kind: 'rule_model_estimate', score: p.match.freeChance.value },
        }
      : null,
    reason: [
      j.category === 'cycle'
        ? 'Rută calculată pentru bicicletă.'
        : j.category === 'walk'
          ? 'Rută pietonală calculată.'
          : 'Auto, parcare și mers final calculate.',
      ...j.limitations,
    ].join(' '),
  };
}
export function contractComparison(
  value: CompleteJourneyResponse,
  id: string,
  environment: Environment,
  origin: string,
  destination: string,
  preferences: Preferences,
): Comparison {
  const journeys = value.journeys.map(contractJourney);
  return {
    environment,
    comparison_id: id,
    origin: { label: origin },
    destination: { label: destination },
    preferences,
    journeys,
    unavailable_modes: value.unavailable.map((v) => ({
      mode: categoryMode[v.category] as Mode,
      reason: v.reason,
    })),
    provenance: [
      ...new Map(
        value.journeys.flatMap((j) =>
          j.legs
            .filter((l) => l.type !== 'parking')
            .map(
              (l) =>
                [
                  l.route.source,
                  { source: l.route.source, kind: 'routing' as const, as_of: j.calculatedAt },
                ] as const,
            ),
        ),
      ).values(),
      ...(value.journeys.some((j) => j.parking)
        ? [
            {
              source: 'Timpark / OpenStreetMap municipal snapshots; SmartMatch rule model',
              kind: 'rule_model' as const,
            },
          ]
        : []),
      ...(environment === 'demo'
        ? [
            {
              source: 'DEMO · plecare și moment de sosire prestabilite; deplasarea simulată',
              kind: 'demo' as const,
            },
          ]
        : []),
    ],
    limitations: [
      ...new Set([
        ...value.limitations,
        ...value.journeys.flatMap((j) => j.limitations),
        'Durata include toate segmentele de deplasare; căutarea și manevrarea parcării nu sunt cunoscute.',
        'Ocuparea live, traficul și accesibilitatea fizică nu sunt confirmate.',
        'Costurile expuse reprezintă parcarea; combustibilul, echipamentul și închirierea nu sunt calculate.',
      ]),
    ],
  };
}
export function constrainComparison(
  value: CompleteJourneyResponse,
  maxWalking: number,
): CompleteJourneyResponse {
  const journeys = value.journeys.filter(
    (j) => (contractJourney(j).walking_minutes ?? Infinity) <= maxWalking,
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
      value.opportunity && ids.has(value.opportunity.journeyId) ? value.opportunity : null,
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
