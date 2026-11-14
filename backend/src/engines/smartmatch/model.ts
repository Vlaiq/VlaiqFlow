import type { AreaProfile, AvailabilityExplainResponse, AvailabilityModelResponse } from '@vlaiq/shared';
import { M2_PER_SPACE, MAX_KERB_COUNTED_M, M_PER_KERB_SPACE, PROFILE_RADIUS_M } from './candidates';
import {
  CURVE_ERROR,
  DEFAULT_CAPACITY,
  FINDABLE_SHARE,
  KAPPA_KNOWN,
  KAPPA_UNKNOWN,
  OCCUPANCY_CURVES,
  P_MAX,
  P_MIN,
  PROFILE_LABEL_RO,
  pFree,
  pFreeDetail,
} from './occupancy';
import { MODEL_SOURCE } from './rank';

const m = (category: keyof typeof PROFILE_RADIUS_M) => PROFILE_RADIUS_M[category]?.[1] ?? 0;

/** How a parking gets its area profile, in the order areaProfile() checks it. */
const RULES: Record<AreaProfile, string> = {
  commercial: `parcare doar pentru clienți sau la cel mult ${m('mall')} m de un mall din OpenStreetMap`,
  centre: 'în zona Timpark verde sau roșie (centrul cu plată), după poligoanele Primăriei',
  campus: `la cel mult ${m('university')} m de o universitate din OpenStreetMap`,
  hospital: `la cel mult ${m('hospital')} m de un spital din OpenStreetMap`,
  station: `la cel mult ${m('station')} m de o gară sau ${m('bus_station')} m de o autogară din OpenStreetMap`,
  residential: 'orice altă poziție',
};

/** The model as it runs, from the same constants: what the page shows cannot drift from the code. */
export function availabilityModel(): AvailabilityModelResponse {
  return {
    name: MODEL_SOURCE,
    version: 'v2 (14 nov 2026)',
    quality: 'estimated',
    calibrated: false,
    params: {
      kappaKnown: KAPPA_KNOWN,
      kappaUnknown: KAPPA_UNKNOWN,
      defaultCapacity: DEFAULT_CAPACITY,
      findableShare: FINDABLE_SHARE,
      pMin: P_MIN,
      pMax: P_MAX,
      curveError: CURVE_ERROR,
      m2PerLotSpace: M2_PER_SPACE,
      mPerKerbSpace: M_PER_KERB_SPACE,
      maxKerbCountedM: MAX_KERB_COUNTED_M,
    },
    profiles: (Object.keys(RULES) as AreaProfile[]).map((id) => ({
      id,
      label: PROFILE_LABEL_RO[id],
      rule: RULES[id],
      curves: OCCUPANCY_CURVES[id],
    })),
  };
}

/** One calculation with all its steps, plus the same parking over every hour of that day. */
export function explainAvailability(
  profile: AreaProfile,
  at: Date,
  capacity: number | null,
): AvailabilityExplainResponse {
  const detail = pFreeDetail(profile, at, capacity);
  const startOfHour = at.getTime() - detail.minute * 60_000;
  const dayCurve = Array.from({ length: 24 }, (_, hour) => {
    const t = new Date(startOfHour + (hour - detail.hour) * 3_600_000);
    const d = pFreeDetail(profile, t, capacity);
    return { hour, expected: d.expected, value: d.value, low: d.range[0], high: d.range[1] };
  });
  return {
    profile,
    at: at.toISOString(),
    capacity,
    quality: 'estimated',
    detail,
    factors: pFree(profile, at, capacity).factors,
    dayCurve,
  };
}
