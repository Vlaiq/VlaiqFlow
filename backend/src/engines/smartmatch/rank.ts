import { formatAmountRo, type RecommendationMode, type RecommendationOption } from '@vlaiq/shared';
import type { Candidate } from './candidates';
import { pFree, type PFreeResult } from './occupancy';
import { MAX_OPTIONS, MODE_PARAMS } from './weights';

export type WalkTime = RecommendationOption['walk'];

export const MODEL_SOURCE = 'Model VLAIQ pe reguli (tip de zonă × oră × zi × capacitate), necalibrat';

export interface RankInput {
  candidates: Candidate[];
  walks: WalkTime[]; // same order as candidates
  at: Date;
  mode: RecommendationMode;
  maxWalkMinutes: number;
  /** Price assumed for a parking whose price is unknown, at least (e.g. the dearest Timpark tariff for the stay). */
  unknownPriceFloor?: number;
  /** Override for availability (tests, demo scenario "parking A is full"). Defaults to the rule model. */
  pFreeOf?: (c: Candidate, at: Date) => PFreeResult;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * SmartMatch ranking (spec §7.4). Pure and deterministic: same input → same order.
 * Unknown prices are never neutral: they count as the most expensive known price in the list and are flagged.
 */
export function rank({ candidates, walks, at, mode, maxWalkMinutes, pFreeOf, unknownPriceFloor = 0 }: RankInput): { options: RecommendationOption[]; considered: number } {
  const params = MODE_PARAMS[mode];
  const reachable = candidates
    .map((c, i) => ({ c, walk: walks[i]! }))
    .filter(({ walk }) => walk && walk.minutes <= maxWalkMinutes);

  const known = reachable.map(({ c }) => c.price.total).filter((t): t is number => t != null);
  const worstPrice = Math.max(unknownPriceFloor, ...known);

  const options = reachable.map(({ c, walk }): RecommendationOption => {
    const p = pFreeOf ? pFreeOf(c, at) : pFree(c.profile, at, c.capacity.value);
    const flags = [...c.flags];
    // A scoring penalty, never a quoted price: unknown must not tie a known free tariff.
    const priceForCost = c.price.total ?? Math.max(1, worstPrice);
    if (c.price.total == null) flags.push('Preț necunoscut: în clasament contează ca cel mai scump preț posibil');
    const cost = {
      walk: r1(walk.minutes),
      risk: r1((1 - p.value) * params.fullPenaltyMinutes),
      price: r1(priceForCost * params.minutesPerCurrency),
      total: 0,
    };
    cost.total = r1(cost.walk + cost.risk + cost.price);
    return {
      id: c.id,
      kind: c.kind,
      name: c.name,
      nameIsDerived: c.nameIsDerived,
      coordinate: c.coordinate,
      access: c.access,
      tariff: c.tariff,
      smsCode: c.smsCode,
      capacity: c.capacity,
      walk,
      pFree: { ...p, quality: 'estimated', source: MODEL_SOURCE, profile: c.profile },
      price: c.price,
      cost,
      flags,
    };
  });

  options.sort((a, b) => a.cost.total - b.cost.total || a.walk.minutes - b.walk.minutes || a.id.localeCompare(b.id));
  return { options: options.slice(0, MAX_OPTIONS), considered: reachable.length };
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const money = (o: RecommendationOption) =>
  o.price.total == null ? 'preț necunoscut' : o.price.total === 0 ? 'gratuit' : `${formatAmountRo(o.price.total)} ${o.price.currency ?? ''}`.trim();
const summary = (o: RecommendationOption) => `${Math.round(o.walk.minutes)} min pe jos, ~${pct(o.pFree.value)} șanse de loc, ${money(o)}`;

/** Template explanation filled only from the computed numbers (spec §7.5). */
export function explain(options: RecommendationOption[]): string | null {
  const [best, next] = options;
  if (!best) return null;
  if (!next) return `${best.name}: ${summary(best)}. Este singura parcare găsită în raza aleasă.`;
  const gain = r1(next.cost.total - best.cost.total);
  return (
    `${best.name} e prima alegere: ${summary(best)}. ` +
    `Rezerva, ${next.name}: ${summary(next)}. ` +
    (gain <= 0
      ? 'Cele două sunt la egalitate.'
      : gain < 1
        ? 'Diferența dintre ele e mică: sub 1 minut în scorul SmartMatch.'
        : `Prima are un scor SmartMatch mai bun cu ${gain.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} min (mersul, riscul să fie plin și prețul, socotite în minute).`)
  );
}
