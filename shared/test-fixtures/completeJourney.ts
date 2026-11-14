/** SYNTHETIC UNIT/BROWSER TEST DATA. Never a provider-access or real journey claim. */
import type {
  CompleteJourney,
  Coordinate,
  NavigationRoute,
  RecommendationOption,
  RecommendationResponse,
} from '../src';
export const origin: Coordinate = [21.207, 45.7503];
export const destination: Coordinate = [21.2257, 45.7537];
export const parkingPoint: Coordinate = [21.222, 45.751];
export function route(
  from: Coordinate,
  to: Coordinate,
  duration = 300,
  distance = 800,
): NavigationRoute {
  return {
    id: 'synthetic-route',
    geometry: [from, [from[0], to[1]], to],
    duration,
    distance,
    source: 'SYNTHETIC TEST FIXTURE',
    quality: 'estimated',
    steps: [
      { index: 0, type: 'depart', road: '' },
      { index: 2, type: 'arrive', road: '' },
    ],
  };
}
export function parking(id = 'fixture-parking'): RecommendationOption {
  return {
    id,
    kind: 'osm',
    name: 'SYNTHETIC TEST PARKING',
    nameIsDerived: false,
    coordinate: parkingPoint,
    access: 'public',
    tariff: null,
    smsCode: null,
    capacity: { value: null, quality: 'unknown', source: 'fixture' },
    walk: { minutes: 3, meters: 200, quality: 'estimated', source: 'SYNTHETIC MATRIX' },
    drive: { minutes: 5, meters: 800, quality: 'estimated', source: 'SYNTHETIC MATRIX' },
    journeyMinutes: 8,
    pFree: {
      value: 0.5,
      quality: 'estimated',
      source: 'UNCALIBRATED TEST MODEL',
      profile: 'centre',
      expectedOccupancy: 0.5,
      factors: [],
    },
    price: {
      total: null,
      currency: null,
      paidMinutes: null,
      quality: 'unknown',
      source: 'fixture',
      note: 'Preț necunoscut.',
    },
    cost: { total: 5, walk: 3, price: 1, risk: 1 },
    flags: [],
  };
}
export function recommendations(options = [parking()]): RecommendationResponse {
  return {
    options,
    arriveAt: '2026-11-14T10:00:00.000Z',
    stayMinutes: 120,
    mode: 'balanced',
    considered: options.length,
    params: { fullPenaltyMinutes: 12, minutesPerCurrency: 8, maxWalkMinutes: 12 },
    explanation: null,
    model: { name: 'SYNTHETIC', quality: 'estimated', note: 'Uncalibrated fixture' },
  };
}
const m = (value: number | null, unit: 'm' | 's') => ({
  value,
  unit,
  quality: value === null ? ('unknown' as const) : ('estimated' as const),
  source: 'SYNTHETIC TEST FIXTURE',
});
export function activeJourney(
  category: 'walk' | 'cycle' = 'cycle',
  seconds = 420,
): CompleteJourney {
  const r = route(origin, destination, seconds);
  return {
    id: `fixture-${category}`,
    origin,
    destination,
    category,
    legs: [
      {
        id: `leg-${category}`,
        type: category,
        from: origin,
        to: destination,
        route: r,
        profile: category === 'walk' ? 'foot-walking' : 'cycling-regular',
        duration: m(seconds, 's'),
        distance: m(800, 'm'),
        warnings: [],
      } as CompleteJourney['legs'][number],
    ],
    travelSeconds: m(seconds, 's') as CompleteJourney['travelSeconds'],
    distance: m(800, 'm') as CompleteJourney['distance'],
    elapsedSeconds: m(seconds, 's') as CompleteJourney['elapsedSeconds'],
    parking: null,
    practical: true,
    calculatedAt: '2026-11-14T10:00:00.000Z',
    limitations: ['SYNTHETIC TEST FIXTURE'],
  };
}
