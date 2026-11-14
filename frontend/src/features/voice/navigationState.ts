import type { JourneyContext } from '../../../../shared/src/flowVoice';
import type { CompleteJourney, Coordinate } from '@vlaiq/shared';
type Navigation = JourneyContext['navigation'];
const idle: Navigation = {
  active: false,
  route_revision: null,
  remaining_distance_meters: null,
  remaining_duration_seconds: null,
  last_instruction: null,
};
let current: Navigation = idle;
let context: { environment: 'live' | 'demo'; origin: string; destination: string } | null = null;
let journeys: (() => CompleteJourney[]) | null = null;
export const navigationState = {
  read: () => current,
  context: () => (current.active ? context : null),
  provideJourneys: (read: () => CompleteJourney[]) => {
    journeys = read;
    return () => {
      if (journeys === read) journeys = null;
    };
  },
  walkingHandoff: (name: string, coordinate: Coordinate) => {
    const selected = journeys?.().find(
      (j) =>
        j.parking?.name === name &&
        j.parking.coordinate.every((v, i) => Math.abs(v - coordinate[i]!) < 0.000001),
    );
    const walk = selected?.legs.find((leg) => leg.type === 'walk');
    return walk?.type === 'walk' && walk.route.geometry.length >= 2 && walk.duration.value !== null
      ? { seconds: walk.duration.value, source: walk.route.source }
      : null;
  },
  update: (value: Navigation, labels?: typeof context) => {
    current = value;
    if (labels) context = labels;
  },
  clear: () => {
    current = idle;
    context = null;
  },
};
