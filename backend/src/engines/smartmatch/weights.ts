import type { RecommendationMode } from '@vlaiq/shared';

/**
 * Ranking parameters (spec §7.4). A recommendation's cost is expressed in minutes:
 *
 *   cost = walk_min + (1 − p_free) × fullPenaltyMinutes + price × minutesPerCurrency
 *
 * fullPenaltyMinutes = time lost when the parking turns out full (driving on to the next one).
 * minutesPerCurrency = how many minutes of walking one unit of money is worth.
 * These are product choices, not measurements; they are shown in the UI ("Cum calculăm").
 */
export const MODE_PARAMS: Record<RecommendationMode, { fullPenaltyMinutes: number; minutesPerCurrency: number }> = {
  balanced: { fullPenaltyMinutes: 12, minutesPerCurrency: 8 },
  cheap: { fullPenaltyMinutes: 10, minutesPerCurrency: 25 },
  sure: { fullPenaltyMinutes: 20, minutesPerCurrency: 4 },
};

/** Straight-line pre-filter before asking the walking router (≈ 12–13 min on foot). */
export const CANDIDATE_RADIUS_M = 1000;
/** At most this many candidates go to the walking matrix (ORS free plan: 50 locations per request). */
export const MAX_MATRIX_CANDIDATES = 30;
/** Paid street segments kept per request: the nearest ones, one per street name. */
export const MAX_STREET_CANDIDATES = 8;
/** Options returned to the client. */
export const MAX_OPTIONS = 5;
/** A customers-only parking (mall, shop) is offered only when the destination is that close. */
export const CUSTOMERS_ONLY_MAX_M = 300;
