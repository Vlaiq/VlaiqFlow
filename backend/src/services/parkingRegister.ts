import {
  inRing,
  ringAreaM2,
  ringCentre,
  TARIFF_LABEL_RO,
  TIMPARK_CURRENCY,
  type Coordinate,
  type ParkingRegisterResponse,
  type ParkingRegisterRow,
  type TimparkFeature,
  type TimparkTariffs,
} from '@vlaiq/shared';
import { areaProfile, M2_PER_SPACE, streetCapacity } from '../engines/smartmatch/candidates';
import { cityData } from './cityData';
import { parkingStore } from './parkingStore';

/**
 * The public parking register: every parking SmartMatch can recommend, built with the same rules the
 * engine uses (capacity estimates, zone tariff for OSM lots, area profile). Only snapshot data, no live
 * values, so it is cached until the snapshots change (a backend restart).
 */
let cached: ParkingRegisterResponse | null = null;

const osmUrl = (id: string): string | null => {
  const m = /^osm-(node|way|relation)-(\d+)$/.exec(id);
  return m ? `https://www.openstreetmap.org/${m[1]}/${m[2]}` : null;
};

function timparkHourly(f: Pick<TimparkFeature, 'tariff' | 'progressive' | 'checked'>, tariffs: TimparkTariffs, estimated = false) {
  const amount = f.progressive ? tariffs.progressive[0]?.eur ?? null : tariffs.hourly[f.tariff].eur;
  return {
    value: amount,
    currency: TIMPARK_CURRENCY,
    quality: estimated ? ('estimated' as const) : ('confirmed' as const),
    source: 'Primăria Timișoara, tarife Timpark (snapshot)',
    note: f.progressive
      ? `Tarif progresiv: prima oră ${amount ?? '?'} ${TIMPARK_CURRENCY}, apoi crește pe ore (${tariffs.progressive.map((s) => s.eur).join(' / ')}).`
      : `Tarif ${TARIFF_LABEL_RO[f.tariff]}, cod SMS ${tariffs.hourly[f.tariff].code} la ${tariffs.smsNumber}.`,
  };
}

export function parkingRegister(): ParkingRegisterResponse {
  if (cached) return cached;
  const timpark = cityData.timpark();
  const features = timpark?.data.features ?? [];
  const tariffs = timpark?.data.tariffs;
  const places = cityData.osmPlaceList();
  const zones = features
    .filter((f) => f.kind === 'zone')
    .map((f) => ({ tariff: f.tariff, progressive: f.progressive, checked: f.checked, ring: f.coordinates as Coordinate[] }));
  const rows: ParkingRegisterRow[] = [];

  const lots = features.filter((f) => f.kind === 'lot');
  for (const f of lots) {
    if (!tariffs) break;
    const ring = f.coordinates as Coordinate[];
    const [lng, lat] = ringCentre(ring);
    const area = ringAreaM2(ring);
    const cap = area >= 100 ? Math.round(area / M2_PER_SPACE) : null;
    rows.push({
      id: `timpark-${f.id}`,
      kind: 'timpark_lot',
      name: f.name.trim() || 'Parcare Timpark fără nume',
      nameIsDerived: f.name.trim() === '',
      lng,
      lat,
      sourceRef: `Timpark ${f.id}`,
      sourceUrl: null,
      access: 'public',
      checked: f.checked,
      tariff: f.tariff,
      capacity: cap
        ? { value: cap, quality: 'estimated', source: `suprafața conturului (${Math.round(area)} m²) ÷ ${M2_PER_SPACE} m² pe loc` }
        : { value: null, quality: 'unknown', source: 'none' },
      hourly: timparkHourly(f, tariffs),
      profile: areaProfile([lng, lat], { zones, places, tariff: f.tariff }),
      duplicateOf: null,
      flags: f.checked ? [] : ['Contur neverificat de Primărie'],
    });
  }

  for (const f of features) {
    if (f.kind !== 'street' || !tariffs) continue;
    const line = f.coordinates as Coordinate[];
    const [lng, lat] = line[Math.floor(line.length / 2)]!;
    rows.push({
      id: `timpark-${f.id}`,
      kind: 'timpark_street',
      name: f.name.trim() || 'Stradă cu plată fără nume',
      nameIsDerived: f.name.trim() === '',
      lng,
      lat,
      sourceRef: `Timpark ${f.id}`,
      sourceUrl: null,
      access: 'public',
      checked: f.checked,
      tariff: f.tariff,
      capacity: streetCapacity(line),
      hourly: timparkHourly(f, tariffs),
      profile: areaProfile([lng, lat], { zones, places, tariff: f.tariff }),
      duplicateOf: null,
      flags: f.checked ? [] : ['Segment neverificat de Primărie'],
    });
  }

  const lotRings = lots.map((f) => ({ id: `timpark-${f.id}`, name: f.name.trim(), ring: f.coordinates as Coordinate[] }));
  const osm = parkingStore.all();
  for (const p of osm.parkings) {
    const point: Coordinate = [p.lng, p.lat];
    const dup = lotRings.find((l) => inRing(point, l.ring));
    const zone = p.access !== 'customers' && tariffs ? zones.find((z) => inRing(point, z.ring)) : undefined;
    const feeNo = p.price.value?.perHourRon === 0;
    const flags: string[] = [];
    if (p.access === 'customers') flags.push('Doar pentru clienți');
    if (p.access === 'unknown') flags.push('Acces nespecificat în OpenStreetMap');
    if (p.nameIsDerived) flags.push('Nume dat de noi după poziție, nu oficial');
    if (dup) flags.push(`În conturul parcării Timpark ${dup.name || dup.id}: SmartMatch folosește datele Timpark`);
    const hourly: ParkingRegisterRow['hourly'] =
      zone && tariffs
        ? {
            ...timparkHourly(zone, tariffs, true),
            source: 'Primăria Timișoara, tariful zonei, presupus pentru această parcare',
            note: `Parcarea e în zona Timpark ${TARIFF_LABEL_RO[zone.tariff]}, dar nu e în lista Timpark: am presupus tariful zonei.${feeNo ? ' OpenStreetMap o marchează gratuită (fee=no): conflict, neverificat.' : ''}`,
          }
        : feeNo
          ? { value: 0, currency: null, quality: 'estimated', source: p.price.source, note: 'Gratuită după OpenStreetMap (fee=no), neverificat.' }
          : { value: null, currency: null, quality: 'unknown', source: 'none', note: 'Preț necunoscut: nici OpenStreetMap, nici Timpark nu îl dau.' };
    rows.push({
      id: p.id,
      kind: 'osm',
      name: p.name,
      nameIsDerived: p.nameIsDerived,
      lng: p.lng,
      lat: p.lat,
      sourceRef: p.source,
      sourceUrl: osmUrl(p.id),
      access: p.access,
      checked: null,
      tariff: null,
      capacity:
        p.capacity.value != null && p.capacity.value > 0
          ? p.capacity
          : { value: null, quality: 'unknown', source: 'none' },
      hourly,
      profile: areaProfile(point, { zones, places, customersOnly: p.access === 'customers' }),
      duplicateOf: dup?.id ?? null,
      flags,
    });
  }

  cached = {
    generatedAt: new Date().toISOString(),
    timpark: timpark ? { source: timpark.source, fetchedAt: timpark.fetchedAt, version: timpark.data.version } : null,
    osm: osm.dataset,
    rows,
  };
  return cached;
}
