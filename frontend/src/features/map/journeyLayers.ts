import type { CompleteJourney } from '@vlaiq/shared';
export const JOURNEY_SOURCE = 'flow-complete-journey';
/** Separate features keep provider geometries intact; no interpolation between unrelated routes. */
export function journeyFeatures(
  journey: CompleteJourney | null,
  selectedLeg: string | null,
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features:
      journey?.legs.flatMap((leg) =>
        leg.type === 'parking'
          ? []
          : [
              {
                type: 'Feature' as const,
                geometry: { type: 'LineString' as const, coordinates: leg.route.geometry },
                properties: {
                  legId: leg.id,
                  mode: leg.type,
                  emphasized: selectedLeg === null || selectedLeg === leg.id,
                },
              },
            ],
      ) ?? [],
  };
}
