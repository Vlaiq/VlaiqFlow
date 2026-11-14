import {
  StreetIndex,
  type RecommendationRequest,
  type RecommendationResponse,
} from '@vlaiq/shared';
import {
  buildCandidates,
  explain,
  MAX_MATRIX_CANDIDATES,
  MODE_PARAMS,
  MODEL_SOURCE,
  rank,
} from '../engines/smartmatch';
import { cityData } from './cityData';
import { parkingStore } from './parkingStore';
import { walkTimes } from './walking';
import { driveTimes } from './driving';

let streetIndex: StreetIndex | null = null;
const streets = () => (streetIndex ??= new StreetIndex(cityData.osmStreetList()));

export async function recommendParkings(
  input: RecommendationRequest,
): Promise<RecommendationResponse> {
  const { destination, origin, stayMinutes, mode, maxWalkMinutes } = input;
  const at = input.arriveAt ? new Date(input.arriveAt) : new Date();

  const candidates = buildCandidates({
    destination,
    at,
    stayMinutes,
    parkings: parkingStore.all().parkings,
    timpark: cityData.timpark(),
    places: cityData.osmPlaceList(),
    streets: streets(),
  }).slice(0, MAX_MATRIX_CANDIDATES);

  const [walks, drives] = await Promise.all([
    walkTimes(
      destination,
      candidates.map((c) => c.coordinate),
    ),
    driveTimes(
      origin,
      candidates.map((c) => c.coordinate),
    ),
  ]);
  // An unknown price is never treated as free: it counts at least as the dearest Timpark tariff for the whole stay.
  const tariffs = cityData.timpark()?.data.tariffs;
  const unknownPriceFloor = tariffs
    ? Math.max(
        ...Object.values(tariffs.hourly).map((t) => t.eur),
        tariffs.progressive[0]?.eur ?? 0,
      ) * Math.ceil(stayMinutes / 60)
    : 0;
  const ranked = rank({ candidates, walks, at, mode, maxWalkMinutes, unknownPriceFloor });
  const considered = ranked.considered;
  const byId = new Map(candidates.map((candidate, i) => [candidate.id, drives[i]]));
  const options = ranked.options.map((option) => ({
    ...option,
    drive: byId.get(option.id),
    journeyMinutes:
      byId.get(option.id)?.minutes == null
        ? null
        : Math.round((byId.get(option.id)!.minutes! + option.walk.minutes) * 10) / 10,
  }));

  const body: RecommendationResponse = {
    arriveAt: at.toISOString(),
    stayMinutes,
    mode,
    params: { ...MODE_PARAMS[mode], maxWalkMinutes },
    options,
    considered,
    explanation: explain(options),
    model: {
      name: MODEL_SOURCE,
      quality: 'estimated',
      note: 'Nu există date de ocupare în timp real pentru Timișoara. Șansa de loc liber este o estimare după reguli, nu o măsurătoare.',
    },
  };
  return body;
}
