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
