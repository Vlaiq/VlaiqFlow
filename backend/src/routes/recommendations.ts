import { Router } from 'express';
import {
  RecommendationRequest,
  StreetIndex,
  type ApiError,
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
import { cityData } from '../services/cityData';
import { parkingStore } from '../services/parkingStore';
import { walkTimes } from '../services/walking';
import { driveTimes } from '../services/driving';

export const recommendationsRouter = Router();

let streetIndex: StreetIndex | null = null;
const streets = () => (streetIndex ??= new StreetIndex(cityData.osmStreetList()));

const inArea = ([lng, lat]: [number, number]) =>
  lng >= 21 && lng <= 21.5 && lat >= 45.6 && lat <= 45.9;

/** POST /api/recommendations — SmartMatch parking ranking for a destination and arrival time (spec §7, §9). */
recommendationsRouter.post('/', async (req, res) => {
  const input = RecommendationRequest.safeParse(req.body);
  if (!input.success) {
    const body: ApiError = {
      error: { code: 'INVALID_INPUT', message: 'Cerere invalidă pentru recomandare.' },
    };
    return res.status(400).json(body);
  }
  const { destination, origin, stayMinutes, mode, maxWalkMinutes } = input.data;
  if (!inArea(destination) || (origin && !inArea(origin))) {
    const body: ApiError = {
      error: { code: 'OUTSIDE_AREA', message: 'Recomandările sunt disponibile în zona Timișoara.' },
    };
    return res.status(400).json(body);
  }
  const at = input.data.arriveAt ? new Date(input.data.arriveAt) : new Date();

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
  res.json(body);
});
