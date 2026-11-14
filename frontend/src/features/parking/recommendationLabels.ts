import { formatAmountRo, type RecommendationOption } from '@vlaiq/shared';

export const KIND_LABEL: Record<RecommendationOption['kind'], string> = {
  timpark_lot: 'Parcare Timpark',
  timpark_street: 'Parcare cu plată pe stradă (Timpark)',
  osm: 'Parcare din OpenStreetMap',
};

export const ACCESS_LABEL: Record<RecommendationOption['access'], string> = {
  public: 'Publică',
  customers: 'Doar pentru clienți',
  unknown: 'Nespecificat în OpenStreetMap',
};

export const stayLabel = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);

export const fmt1 = (n: number) => n.toLocaleString('ro-RO', { maximumFractionDigits: 1 });

export function priceText(o: RecommendationOption): string {
  if (o.price.total == null) return 'Necunoscut';
  if (o.price.total === 0) return 'Gratuit';
  return `${formatAmountRo(o.price.total)} ${o.price.currency ?? ''}`.trim();
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;

export interface ScoreInput {
  score: { walk: number; risk: number; price: number; drive?: number | null; total: number };
  /** Real price for the stay; null when unknown. */
  price: { amount: number | null; currency: string | null };
  freeChance: number;
  params: { fullPenaltyMinutes: number; minutesPerCurrency: number };
}
export interface ScoreLine {
  id: 'drive' | 'walk' | 'risk' | 'price';
  label: string;
  /** How the minutes were obtained, in plain words. */
  how: string;
  minutes: number;
}

/**
 * The SmartMatch cost, line by line. Walk and drive are real minutes; the risk of a full parking and the
 * price are converted into minutes so they can be added up. Every line says which conversion was used.
 */
export function scoreLines({ score, price, freeChance, params }: ScoreInput): ScoreLine[] {
  const perCurrency = `${fmt1(params.minutesPerCurrency)} min pentru fiecare ${price.currency ?? 'unitate de bani'}`;
  const lines: ScoreLine[] = [];
  if (score.drive != null)
    lines.push({ id: 'drive', label: 'Drum cu mașina', how: 'minute de condus', minutes: score.drive });
  lines.push({ id: 'walk', label: 'Mers pe jos', how: 'minute de mers', minutes: score.walk });
  lines.push({
    id: 'risk',
    label: 'Risc să fie plin',
    how: `~${pct(1 - freeChance)} risc × ${fmt1(params.fullPenaltyMinutes)} min pierdute dacă e plin`,
    minutes: score.risk,
  });
  lines.push({
    id: 'price',
    label: 'Preț',
    how:
      price.amount == null
        ? `necunoscut: socotit ca cel mai scump tarif (${perCurrency})`
        : price.amount === 0
          ? 'gratuit la ora aleasă'
          : `${[formatAmountRo(price.amount), price.currency].filter(Boolean).join(' ')} × ${perCurrency}`,
    minutes: score.price,
  });
  return lines;
}

/** Plain-language level for the estimated chance of a free space. Text is always shown, never colour alone. */
export function chanceLevel(p: number): { label: string; tone: 'good' | 'medium' | 'low' } {
  if (p >= 0.7) return { label: 'Șanse bune', tone: 'good' };
  if (p >= 0.4) return { label: 'Șanse medii', tone: 'medium' };
  return { label: 'Risc mare să fie plin', tone: 'low' };
}
