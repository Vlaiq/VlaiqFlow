/**
 * How long a successful route stays in memory. Routes carry no live traffic, so the same pair gives
 * the same geometry for hours; keeping them 30 minutes makes repeat trips (and the DEMO) instant and
 * keeps us well inside the providers' usage policies (FOSSGIS: at most one request per second).
 * Failures and saved fallbacks keep their own short lifetimes.
 */
export const ROUTE_CACHE = { ttlMs: 30 * 60_000, entries: 500 } as const;
