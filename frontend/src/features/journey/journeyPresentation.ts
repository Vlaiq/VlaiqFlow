import {
  ActiveJourneyContext,
  type CompleteJourney,
  type CompleteJourneyResponse,
  type Destination,
} from '@vlaiq/shared';
import { handoffParams } from '../navigation/scenario';
export const journeyMinutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));
export const journeyDistance = (meters: number) =>
  meters >= 1000
    ? `${(meters / 1000).toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km`
    : `${Math.round(meters)} m`;
/**
 * Why a parking from the SmartMatch list ("P1") has no complete journey, using the reasons the
 * backend reports. Nothing is inferred from gaps in the numbering.
 */
export function skippedParkingNotes(
  skipped: CompleteJourneyResponse['parkingSkipped'],
  maxWalkMinutes: number,
): string[] {
  const list = (reason: (typeof skipped)[number]['reason']) =>
    skipped.filter((s) => s.reason === reason).map((s) => `P${s.rank}`);
  const notes: string[] = [];
  const customers = list('customers_only');
  if (customers.length) {
    const one = customers.length === 1;
    notes.push(
      `${customers.join(', ')} ${one ? 'e' : 'sunt'} doar pentru clienți, deci nu ${one ? 'apare' : 'apar'} în drumul complet.`,
    );
  }
  const walk = list('walk_unavailable');
  if (walk.length)
    notes.push(
      `${walk.join(', ')} ${walk.length === 1 ? 'nu apare' : 'nu apar'} aici: traseul calculat pe jos de la parcare depășește ${maxWalkMinutes} min sau nu a putut fi calculat acum. Lista „Unde parchezi” poate folosi o estimare a mersului.`,
    );
  return notes;
}
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
/** Minutes of the routed walking leg from the parking to the destination, if the journey has one. */
const walkLegMinutes = (j: CompleteJourney): number | null => {
  const leg = j.legs.find((l) => l.type === 'walk');
  return leg?.duration.value != null ? leg.duration.value / 60 : null;
};

/**
 * Link to car navigation for a car + parking journey. When the panel computed other car options, the
 * next one by SmartMatch rank travels along for the DEMO "parking full" scenario (spec §6.9).
 */
export function carNavigationHref(
  j: CompleteJourney,
  others: CompleteJourney[] = [],
  destinationName?: string,
): string | null {
  if (!j.parking) return null;
  const rank = j.parking.match.rank;
  const backup = others
    .filter((o) => o.parking && o.parking.match.rank !== rank && walkLegMinutes(o) != null)
    .sort((a, b) => a.parking!.match.rank - b.parking!.match.rank)[0];
  return `/navigation?${new URLSearchParams({
    to: j.parking.coordinate.join(','),
    name: j.parking.name,
    area: 'Parcare · mersul final rămâne în planificator',
    from: j.origin.join(','),
    fromName: 'Plecarea aleasă în planificator',
    ...handoffParams({
      chance: j.parking.match.freeChance.value,
      walkMinutes: walkLegMinutes(j),
      backup: backup?.parking
        ? {
            name: backup.parking.name,
            coordinate: backup.parking.coordinate,
            chance: backup.parking.match.freeChance.value,
            walkMinutes: walkLegMinutes(backup)!,
          }
        : null,
      final: destinationName ? { name: destinationName, coordinate: j.destination } : null,
    }),
  })}`;
}
