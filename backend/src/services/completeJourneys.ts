import { createHash } from 'node:crypto';
import {
  CompleteJourney,
  CompleteJourneyResponse,
  RecommendationRequest,
  journeyPractical,
  type CompleteJourneyRequest,
  type Coordinate,
  type JourneyLeg,
  type RecommendationOption,
  type NavigationRoute,
} from '@vlaiq/shared';
import { recommendParkings } from './parkingRecommendations';
import { getRoutes } from './routing';
import { activeDirections, validateEndpoints } from './activeRouting';
import { rankCompleteJourneys } from '../engines/completeRanking';

export const COMPLETE_POLICY = {
  parkingCandidates: 3,
  concurrentParking: 2,
  cacheEntries: 100,
  pendingRequests: 12,
} as const;
export const completeDependencies = {
  recommend: recommendParkings,
  drive: getRoutes,
  active: activeDirections,
};
type Dependencies = typeof completeDependencies;
const metric = <T extends 'm' | 's'>(value: number | null, unit: T, source: string) => ({
  value,
  unit,
  source,
  quality: value === null ? ('unknown' as const) : ('estimated' as const),
});
const unknownSearch =
  'Timp de căutare și manevrare a parcării indisponibil; exclus din timpul calculat.';
const limitations = [
  'Fără trafic sau ocupare live. Duratele sunt estimări ale furnizorilor.',
  'Geometria poate fi ajustată de furnizor la rețeaua rutieră (cel mult 250 m); intrările și accesibilitatea nu sunt certificate.',
  'Transportul public complet nu este calculat; static GTFS nu înseamnă sosiri live.',
];
function movingLeg(
  type: 'drive' | 'walk' | 'cycle',
  from: Coordinate,
  to: Coordinate,
  route: NavigationRoute,
): JourneyLeg {
  validateEndpoints(route.geometry, from, to);
  return {
    id: `leg-${type}`,
    type,
    profile:
      type === 'drive' ? 'driving-car' : type === 'walk' ? 'foot-walking' : 'cycling-regular',
    from,
    to,
    route,
    distance: metric(route.distance, 'm', route.source),
    duration: metric(route.duration, 's', route.source),
    warnings: [],
  } as JourneyLeg;
}
function construct(
  req: CompleteJourneyRequest,
  category: CompleteJourney['category'],
  legs: JourneyLeg[],
  parking: CompleteJourney['parking'],
  calculatedAt: string,
): CompleteJourney {
  const moves = legs.filter((l) => l.type !== 'parking');
  const seconds = moves.reduce((n, l) => n + l.route.duration, 0);
  const source = [...new Set(moves.map((l) => l.route.source))].join(' + ');
  const identity = JSON.stringify([req.origin, req.destination, category, parking?.id]);
  return CompleteJourney.parse({
    id: `flow-${createHash('sha256').update(identity).digest('hex').slice(0, 16)}`,
    origin: req.origin,
    destination: req.destination,
    category,
    legs,
    parking,
    travelSeconds: metric(seconds, 's', source),
    distance: metric(
      moves.reduce((n, l) => n + l.route.distance, 0),
      'm',
      source,
    ),
    elapsedSeconds: metric(parking ? null : seconds, 's', parking ? unknownSearch : source),
    practical: category === 'car_park_walk' || journeyPractical(category, seconds),
    calculatedAt,
    limitations: [
      ...limitations,
      ...(parking
        ? [
            unknownSearch,
            'Costul afișat privește doar parcarea, pentru durata și ora alese. Combustibilul și costul total al călătoriei sunt necunoscute.',
          ]
        : ['Rutarea activă nu certifică siguranța, piste separate sau accesibilitatea.']),
    ],
  });
}
function parkingInfo(
  p: RecommendationOption,
  req: CompleteJourneyRequest,
  tariffAt: string,
): NonNullable<CompleteJourney['parking']> {
  const priceKnown = p.price.total === 0 || (p.price.total !== null && p.price.currency !== null);
  return {
    id: p.id,
    name: p.name,
    coordinate: p.coordinate,
    access: p.access === 'public' ? 'public' : 'unknown',
    availability: {
      value: null,
      quality: 'unknown',
      source: 'Nu există o sursă de ocupare live pentru această parcare.',
    },
    fee: {
      minorUnits: priceKnown ? Math.round(p.price.total! * 100) : null,
      currency: p.price.currency,
      quality: priceKnown ? 'estimated' : 'unknown',
      source: p.price.source || 'Tarif indisponibil',
      note:
        p.price.note +
        (p.kind !== 'osm'
          ? ' Calcul orientativ din câmpul eur și programul snapshot-ului; verifică suma finală în Timpark/CityApp pentru metoda de plată.'
          : ''),
    },
    stayMinutes: req.stayMinutes,
    tariffAt,
    source: p.kind === 'osm' ? 'OpenStreetMap · ODbL' : 'Primăria Timișoara · snapshot Timpark',
    warnings: [
      ...p.flags.filter((f) => !f.startsWith('Preț necunoscut:')),
      ...(p.access === 'unknown'
        ? ['Accesul nu este confirmat; verifică indicatoarele înainte de a intra.']
        : []),
    ],
  };
}
/** Candidate routes are deliberately bounded: up to 3 candidates, 2 at a time, 2 directions each. */
async function carJourneys(
  req: CompleteJourneyRequest,
  at: string,
  deps: Dependencies,
): Promise<CompleteJourney[]> {
  const screened = await deps.recommend(
    RecommendationRequest.parse({
      origin: req.origin,
      destination: req.destination,
      arriveAt: req.arriveAt,
      stayMinutes: req.stayMinutes,
      maxWalkMinutes: req.maxWalkMinutes,
      mode: req.parkingPreference,
    }),
  );
  // Customers-only is not public access. Unknown access is disclosed, never asserted public.
  const candidates = screened.options.filter((p) => p.access !== 'customers');
  // Use actual matrix totals if present. The formula walking estimate only screens; never becomes geometry.
  if (req.parkingPreference === 'balanced')
    candidates.sort(
      (a, b) =>
        (a.journeyMinutes ?? Infinity) - (b.journeyMinutes ?? Infinity) ||
        a.cost.total - b.cost.total ||
        a.id.localeCompare(b.id),
    );
  const selected = candidates.slice(0, COMPLETE_POLICY.parkingCandidates);
  const result: CompleteJourney[] = [];
  let next = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(selected.length, COMPLETE_POLICY.concurrentParking) },
      async () => {
        for (;;) {
          const p = selected[next++];
          if (!p) return;
          try {
            const [drive, walk] = await Promise.all([
              deps.drive(req.origin, p.coordinate),
              deps.active('walk', p.coordinate, req.destination),
            ]);
            if (walk.mode !== 'walk' || walk.route.duration > req.maxWalkMinutes * 60) continue;
            const legs: JourneyLeg[] = [
              movingLeg('drive', req.origin, p.coordinate, drive.routes[0]!),
              {
                id: 'leg-parking',
                type: 'parking',
                from: p.coordinate,
                to: p.coordinate,
                duration: metric(null, 's', unknownSearch),
                warnings: [unknownSearch],
              },
              movingLeg('walk', p.coordinate, req.destination, walk.route),
            ];
            result.push(
              construct(req, 'car_park_walk', legs, parkingInfo(p, req, screened.arriveAt), at),
            );
          } catch {
            /* This candidate must not invalidate the other candidates or active modes. */
          }
        }
      },
    ),
  );
  return result.sort(
    (a, b) => a.travelSeconds.value! - b.travelSeconds.value! || a.id.localeCompare(b.id),
  );
}
export async function calculateCompleteJourneys(
  req: CompleteJourneyRequest,
  deps: Dependencies = completeDependencies,
): Promise<CompleteJourneyResponse> {
  const at = new Date().toISOString();
  const settled = await Promise.allSettled(
    req.modes.map(async (category) => {
      if (category === 'car_park_walk') return carJourneys(req, at, deps);
      const option = await deps.active(category, req.origin, req.destination);
      if (option.mode !== category) throw new Error('WRONG_ROUTING_MODE');
      return [
        construct(
          req,
          category,
          [movingLeg(category, req.origin, req.destination, option.route)],
          null,
          at,
        ),
      ];
    }),
  );
  const journeys: CompleteJourney[] = [],
    unavailable: CompleteJourneyResponse['unavailable'] = [];
  settled.forEach((s, i) => {
    const category = req.modes[i]!;
    if (s.status === 'fulfilled' && s.value.length) journeys.push(...s.value);
    else
      unavailable.push({
        category,
        reason:
          category === 'car_park_walk'
            ? 'Nu putem calcula acum ambele trasee către o parcare eligibilă și apoi la destinație. Verifică limita de mers; parcările rămân disponibile separat.'
            : `Ruta ${category === 'walk' ? 'pietonală' : 'velo'} nu este disponibilă acum: furnizorul nu a returnat un răspuns valid. Nu desenăm o rută aproximată.`,
      });
  });
  const rankings = rankCompleteJourneys(journeys);
  const car = journeys
    .filter((j) => j.category === 'car_park_walk')
    .sort((a, b) => a.travelSeconds.value! - b.travelSeconds.value!)[0];
  const active = journeys
    .filter(
      (j) =>
        j.category !== 'car_park_walk' &&
        j.practical &&
        car &&
        j.travelSeconds.value! - car.travelSeconds.value! <= 900,
    )
    .sort((a, b) => a.travelSeconds.value! - b.travelSeconds.value! || a.id.localeCompare(b.id))[0];
  return CompleteJourneyResponse.parse({
    journeys,
    rankings,
    unavailable,
    opportunity:
      active && car
        ? {
            journeyId: active.id,
            extraSeconds: Math.round(active.travelSeconds.value! - car.travelSeconds.value!),
            explanation:
              'Comparație cu auto + mers final calculate. Căutarea parcării rămâne necunoscută și nu este inclusă.',
          }
        : null,
    calculatedAt: at,
    coverage:
      'Zona Timișoara · date Timpark și OpenStreetMap. Maximum trei parcări cu geometrie completă din lista filtrată SmartMatch; nu un optim global.',
    limitations,
  });
}
const cache = new Map<string, { expires: number; value: CompleteJourneyResponse }>();
const pending = new Map<string, Promise<CompleteJourneyResponse>>();
export async function completeJourneys(req: CompleteJourneyRequest) {
  // Minute bucket preserves tariff/day context. Fixed timestamps and all user constraints are included.
  const key = JSON.stringify({
    ...req,
    preference: undefined,
    arriveAt: req.arriveAt ?? Math.floor(Date.now() / 60000),
  });
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const running = pending.get(key);
  if (running) return running;
  if (pending.size >= COMPLETE_POLICY.pendingRequests) throw new Error('JOURNEY_BUSY');
  const job = calculateCompleteJourneys(req)
    .then((value) => {
      if (cache.size >= COMPLETE_POLICY.cacheEntries) cache.delete(cache.keys().next().value!);
      cache.set(key, { value, expires: Date.now() + (value.unavailable.length ? 15000 : 60000) });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
