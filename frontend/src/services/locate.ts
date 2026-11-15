import type { Coordinate } from '@vlaiq/shared';

/**
 * Positions less precise than this are refused. A laptop without GPS gets its position from Wi-Fi or
 * the internet address, typically ±50 m to a few km; a phone outside, ±5–20 m. Trip planning works
 * with an approximate start (the route starts from there and the precision is always shown), so we
 * accept up to ±5 km instead of asking for GPS precision.
 */
export const MAX_START_ACCURACY_M = 5000;

export type LocateResult =
  | { ok: true; coordinate: Coordinate; accuracy: number }
  | { ok: false; reason: 'unsupported' | 'denied' | 'unavailable' | 'imprecise'; accuracy?: number };

const once = (options: PositionOptions) =>
  new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, options),
  );

/**
 * One position for planning: precise GPS first (6 s), then the faster network position (Wi-Fi or
 * IP, 10 s, may be a few minutes old). Only an explicit refusal stops it early.
 */
export async function locate(): Promise<LocateResult> {
  if (!navigator.geolocation || !window.isSecureContext) return { ok: false, reason: 'unsupported' };
  let position: GeolocationPosition | null = null;
  try {
    position = await once({ enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 });
  } catch (e) {
    if ((e as GeolocationPositionError).code === 1) return { ok: false, reason: 'denied' };
  }
  if (!position || position.coords.accuracy > MAX_START_ACCURACY_M) {
    try {
      const network = await once({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
      if (!position || network.coords.accuracy < position.coords.accuracy) position = network;
    } catch (e) {
      if ((e as GeolocationPositionError).code === 1) return { ok: false, reason: 'denied' };
    }
  }
  if (!position) return { ok: false, reason: 'unavailable' };
  const accuracy = position.coords.accuracy;
  if (accuracy > MAX_START_ACCURACY_M) return { ok: false, reason: 'imprecise', accuracy };
  return { ok: true, coordinate: [position.coords.longitude, position.coords.latitude], accuracy };
}

/** "±40 m" or "±1,2 km" — precision is always shown with a position. */
export function accuracyLabel(m: number): string {
  return m < 1000
    ? `±${Math.round(m)} m`
    : `±${(m / 1000).toLocaleString('ro-RO', { maximumFractionDigits: 1 })} km`;
}

/** Plain Romanian for a failed attempt; `manual` says what to do instead. */
export function locateMessage(result: Exclude<LocateResult, { ok: true }>, manual: string): string {
  switch (result.reason) {
    case 'unsupported':
      return `Browserul nu oferă localizare aici (este nevoie de HTTPS sau localhost). ${manual}`;
    case 'denied':
      return `Accesul la locație este blocat. Permite Locația din iconița de lângă adresa site-ului, apoi reîncearcă. ${manual}`;
    case 'imprecise':
      return `Poziția are o precizie de ${accuracyLabel(result.accuracy ?? 0)}, prea mare chiar și pentru o plecare aproximativă. ${manual}`;
    default:
      return `Nu am primit nicio poziție. Verifică dacă locația este pornită în sistem. ${manual}`;
  }
}
