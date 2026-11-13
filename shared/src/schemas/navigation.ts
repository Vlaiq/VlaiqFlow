import { z } from 'zod';

/** GeoJSON order throughout the navigation stack: longitude, latitude. */
export const Coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type Coordinate = z.infer<typeof Coordinate>;
export const RouteRequest = z.object({ origin: Coordinate, destination: Coordinate });
export const RouteStep = z.object({
  index: z.number().int().nonnegative(),
  type: z.string(),
  modifier: z.string().optional(),
  road: z.string(),
});
export const NavigationRoute = z
  .object({
    id: z.string(),
    distance: z.number().positive(),
    duration: z.number().positive(),
    geometry: z.array(Coordinate).min(2),
    steps: z.array(RouteStep).min(1),
    source: z.string(),
    quality: z.literal('estimated'),
  })
  .refine(
    (r) => r.steps.every((s) => s.index < r.geometry.length),
    'Maneuver outside route geometry',
  );
export type NavigationRoute = z.infer<typeof NavigationRoute>;
export const RoutesResponse = z.object({ routes: z.array(NavigationRoute).min(1).max(3) });
export type RoutesResponse = z.infer<typeof RoutesResponse>;
