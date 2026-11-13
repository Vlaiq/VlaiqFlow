import type { NeighbourhoodFeature, OsmStreet } from './schemas/city';
import type { Parking } from './schemas/parking';
import { neighbourhoodAt, StreetIndex } from './geo';

export const UNNAMED_PARKING = 'Parcare fără nume';
const NEAR_STREET_M = 80; // a parking this close to a street is described by that street

const TYPE_PREFIX: Record<Parking['type'], string> = {
  surface: 'Parcare',
  'multi-storey': 'Parcare etajată',
  underground: 'Parcare subterană',
  street_zone: 'Parcare pe stradă',
  park_and_ride: 'Park & Ride',
  other: 'Parcare',
};

/**
 * Gives every parking its neighbourhood and, when OpenStreetMap has no name, a descriptive name
 * built from its position: "Parcare lângă Strada Paris", or "Parcare în cartierul Fabric".
 * Derived names are flagged (`nameIsDerived`) so the UI never presents them as official.
 */
export function nameParkings(
  parkings: Parking[],
  { neighbourhoods, osmStreets }: { neighbourhoods: NeighbourhoodFeature[]; osmStreets: OsmStreet[] },
): Parking[] {
  const index = new StreetIndex(osmStreets);
  return parkings.map((p) => {
    const hood = neighbourhoodAt([p.lng, p.lat], neighbourhoods)?.properties.name ?? null;
    const unnamed = p.nameIsDerived || p.name === UNNAMED_PARKING;
    if (!unnamed) return { ...p, neighbourhood: hood };

    const street = index.nearest([p.lng, p.lat], NEAR_STREET_M);
    const prefix = TYPE_PREFIX[p.type];
    const preposition = p.type === 'street_zone' ? 'pe' : 'lângă';
    const name = street
      ? `${prefix} ${preposition} ${street.name}`
      : hood
        ? `${prefix} în cartierul ${hood}`
        : UNNAMED_PARKING;
    return { ...p, name, nameIsDerived: true, neighbourhood: hood };
  });
}
