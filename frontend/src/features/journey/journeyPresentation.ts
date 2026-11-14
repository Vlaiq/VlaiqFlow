import { ActiveJourneyContext, type CompleteJourney, type Destination } from '@vlaiq/shared';
export const journeyMinutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));
export const journeyDistance = (meters: number) =>
  meters >= 1000
    ? `${(meters / 1000).toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km`
    : `${Math.round(meters)} m`;
export function plannedActivity(j: CompleteJourney, d: Destination): ActiveJourneyContext | null {
  if (j.category === 'car_park_walk') return null;
  return ActiveJourneyContext.parse({
    id: j.id,
    mode: j.category,
    destinationId: d.id,
    destinationName: d.name,
    distance: j.distance.value,
    duration: j.travelSeconds.value,
    source: j.distance.source,
    calculatedAt: j.calculatedAt,
  });
}
export function carNavigationHref(j: CompleteJourney): string | null {
  if (!j.parking) return null;
  return `/navigation?${new URLSearchParams({
    to: j.parking.coordinate.join(','),
    name: j.parking.name,
    area: 'Parcare · mersul final rămâne în planificator',
    from: j.origin.join(','),
    fromName: 'Plecarea aleasă în planificator',
  })}`;
}
