import { z } from 'zod';

/** GeoJSON order throughout the navigation stack: longitude, latitude. */
export const Coordinate = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
export type Coordinate = z.infer<typeof Coordinate>;
/** `avoid`: school zones (§6.16) the driving route should keep out of, when the provider supports it. */
export const RouteRequest = z.object({
  origin: Coordinate,
  destination: Coordinate,
  avoid: z.array(z.object({ center: Coordinate, radiusM: z.number().min(50).max(400) })).max(4).optional(),
});
export const RouteStep = z.object({
  index: z.number().int().nonnegative(),
  type: z.string(),
  modifier: z.string().optional(),
  road: z.string(),
});
export const NavigationRoute = z
  .object({
    id: z.string(),
    distance: z.number().finite().positive(),
    duration: z.number().finite().positive(),
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
export const RoutesResponse = z.object({
  routes: z.array(NavigationRoute).min(1).max(3),
  /** Requested zones: 'applied' (openrouteservice kept out), 'not_supported' (keyless fallback), 'failed' (no such route). */
  avoidance: z.enum(['applied', 'not_supported', 'failed']).optional(),
  /** Set when the provider was down and the route came from the saved DEMO snapshot (spec §6.8). */
  offline: z.object({ savedAt: z.string() }).optional(),
});
export type RoutesResponse = z.infer<typeof RoutesResponse>;

/**
 * Routes saved from the real providers for the DEMO scenario (spec §6.8), written by
 * `pnpm data:demo-routes`. Used only when the provider fails and both endpoints match a saved pair.
 */
export const OfflineRoutesSnapshot = z.object({
  version: z.literal(1),
  savedAt: z.string(),
  note: z.string(),
  scenario: z.object({
    origin: z.object({ name: z.string(), coordinate: Coordinate }),
    destination: z.object({ name: z.string(), coordinate: Coordinate }),
  }),
  driving: z.array(
    z.object({ origin: Coordinate, destination: Coordinate, routes: z.array(NavigationRoute).min(1).max(3) }),
  ),
  walking: z.array(z.object({ origin: Coordinate, destination: Coordinate, route: NavigationRoute })),
});
export type OfflineRoutesSnapshot = z.infer<typeof OfflineRoutesSnapshot>;
