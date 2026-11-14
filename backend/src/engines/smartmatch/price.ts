import { formatAmountRo, isPaidAt, TARIFF_LABEL_RO, TIMPARK_CURRENCY, type TariffColor, type TimparkTariffs } from '@vlaiq/shared';
import type { RecommendationOption } from '@vlaiq/shared';

type Price = RecommendationOption['price'];

const SLOT_MIN = 5;

/** Minutes of the stay [start, start + stay) that fall inside the published paid hours of a tariff colour. */
export function paidMinutes(tariff: TariffColor, start: Date, stayMinutes: number, schedule: TimparkTariffs['schedule']): number {
  let paid = 0;
  for (let m = 0; m < stayMinutes; m += SLOT_MIN) {
    if (isPaidAt(tariff, new Date(start.getTime() + m * 60_000), schedule)) paid += Math.min(SLOT_MIN, stayMinutes - m);
  }
  return paid;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Price of a Timpark stay from the City Hall tariffs (`confirmed`).
 * An SMS buys one hour, so paid time is billed in started hours. Progressive tariffs charge the
 * published step for the 1st, 2nd, 3rd… hour (the last step repeats). A day ticket replaces hourly
 * pricing when it is cheaper and the colour allows it.
 */
export function timparkPrice(
  tariff: TariffColor,
  progressive: boolean,
  start: Date,
  stayMinutes: number,
  tariffs: TimparkTariffs,
  source: string,
): Price {
  const paid = paidMinutes(tariff, start, stayMinutes, tariffs.schedule);
  if (paid === 0) {
    return {
      total: 0,
      currency: TIMPARK_CURRENCY,
      paidMinutes: 0,
      quality: 'confirmed',
      source,
      note: 'Gratuit la ora aleasă: în afara programului plătit Timpark.',
    };
  }
  const hours = Math.ceil(paid / 60);
  let total: number;
  let note: string;
  if (progressive) {
    const steps = tariffs.progressive.map((s) => s.eur);
    total = 0;
    for (let h = 0; h < hours; h++) total += steps[Math.min(h, steps.length - 1)] ?? 0;
    note = `Tarif progresiv, ${hours} h plătite (pașii publicați de Primărie).`;
  } else {
    const rate = tariffs.hourly[tariff].eur;
    total = rate * hours;
    note = `${hours} h × ${formatAmountRo(rate)} ${TIMPARK_CURRENCY}/h (tarif ${TARIFF_LABEL_RO[tariff]}).`;
  }
  if (tariffs.day.tariffs.includes(tariff) && tariffs.day.eur < total) {
    total = tariffs.day.eur;
    note = `Bilet de o zi (${formatAmountRo(tariffs.day.eur)} ${TIMPARK_CURRENCY}), mai ieftin decât plata pe oră.`;
  }
  if (paid < stayMinutes) note += ` Doar ${paid} din ${stayMinutes} min sunt în programul plătit.`;
  return { total: round2(total), currency: TIMPARK_CURRENCY, paidMinutes: paid, quality: 'confirmed', source, note };
}

/** OSM parkings: only `fee=no` gives a defensible price (0). Everything else is unknown. */
export function osmPrice(feeNo: boolean, source: string): Price {
  return feeNo
    ? { total: 0, currency: null, paidMinutes: 0, quality: 'estimated', source, note: 'Gratuită după OpenStreetMap (fee=no), neverificat.' }
    : { total: null, currency: null, paidMinutes: null, quality: 'unknown', source: 'none', note: 'Preț necunoscut.' };
}

/**
 * An OSM parking (not a Timpark lot) inside a paid Timpark zone: we assume the zone's tariff
 * (spec §5.2), but only as an estimate, because the lot may be private or run by someone else.
 * An OSM `fee=no` inside a paid zone is a conflict, so it is never shown as a known free price.
 */
export function zoneEstimatePrice(zonePrice: Price, tariff: TariffColor, osmSaysFree: boolean): Price {
  const zone = `zona Timpark ${TARIFF_LABEL_RO[tariff]}`;
  const base =
    zonePrice.total === 0
      ? `Probabil gratuit la ora aleasă: în afara programului plătit al zonei (${zone}).`
      : `Estimat după tariful zonei: parcarea e în ${zone}, dar nu e în lista Timpark. ${zonePrice.note ?? ''}`.trim();
  return {
    ...zonePrice,
    quality: 'estimated',
    source: `${zonePrice.source}; tariful zonei, presupus pentru această parcare`,
    note: osmSaysFree ? `${base} OpenStreetMap o marchează gratuită (fee=no), neverificat.` : base,
  };
}
