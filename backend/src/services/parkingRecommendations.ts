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
  pFree,
  rank,
  schoolZone,
  applySchoolZone,
  type Candidate,
} from '../engines/smartmatch';
import { cityData } from './cityData';
import { parkingStore } from './parkingStore';
import { walkTimes } from './walking';
import { driveTimes } from './driving';
import { rankingWalk, tourCentre, tourFor, type Tour } from '../engines/smartmatch/tour';

let streetIndex: StreetIndex | null = null;
const streets = () => (streetIndex ??= new StreetIndex(cityData.osmStreetList()));

export async function recommendParkings(
  input: RecommendationRequest,
): Promise<RecommendationResponse> {
  const { destination, origin, stayMinutes, mode, maxWalkMinutes } = input;
  const at = input.arriveAt ? new Date(input.arriveAt) : new Date();
  const stops = input.stops ?? [];
  const chain = [destination, ...stops.map((s) => s.coordinate)];

  const all = buildCandidates({
    // With stops (§6.19) the parkings around the middle of the places are candidates too.
    destination: stops.length ? tourCentre(chain) : destination,
    at,
    stayMinutes,
    parkings: parkingStore.all().parkings,
    timpark: cityData.timpark(),
    places: cityData.osmPlaceList(),
    streets: streets(),
  });
  // School drop-off zone (§6.16): applied before the matrix so the walking times go to the parkings we keep.
  const zoned = applySchoolZone(
    all,
    schoolZone({ destination, at, mode: input.schoolZone, schools: cityData.schoolList(), streets: streets() }),
  );
  const candidates = zoned.kept.slice(0, MAX_MATRIX_CANDIDATES);

  const points = candidates.map((c) => c.coordinate);
  const last = stops.at(-1)?.coordinate;
  const [walks, drives, walksOut, between] = await Promise.all([
    walkTimes(destination, points),
    driveTimes(origin, points),
    last ? walkTimes(last, points) : Promise.resolve(null),
    Promise.all(chain.slice(1).map((to, i) => walkTimes(to, [chain[i]!]).then((w) => w[0]!))),
  ]);
  // A tour ranks parkings by the walking that depends on them: parking → destination and last stop → parking.
  const tours = new Map<string, Tour>();
  let rankCandidates = candidates;
  let rankWalks = walks;
  if (walksOut) {
    const names = { places: [input.destinationName ?? 'Destinația', ...stops.map((s) => s.name)] };
    const kept = candidates.flatMap((c, i) => {
      const w = rankingWalk(walks[i]!, walksOut[i]!, maxWalkMinutes);
      if (!w) return [];
      tours.set(c.id, tourFor({ parking: c.name, ...names }, walks[i]!, between, walksOut[i]!));
      return [{ c, w }];
    });
    rankCandidates = kept.map((k) => k.c);
    rankWalks = kept.map((k) => k.w);
  }
  const walkOf = new Map(candidates.map((c, i) => [c.id, walks[i]!]));
  // An unknown price is never treated as free: it counts at least as the dearest Timpark tariff for the whole stay.
  const tariffs = cityData.timpark()?.data.tariffs;
  const unknownPriceFloor = tariffs
    ? Math.max(
        ...Object.values(tariffs.hourly).map((t) => t.eur),
        tariffs.progressive[0]?.eur ?? 0,
      ) * Math.ceil(stayMinutes / 60)
    : 0;
  // Without an explicit arrival time the driver arrives after the drive, not now: when the router gave a
  // real driving time to a parking, its chance is computed for now + that time (spec §7.3).
  const driveMinutesOf = new Map(candidates.map((c, i) => [c.id, drives[i]?.minutes ?? null]));
  const pFreeOf = input.arriveAt
    ? undefined
    : (c: Candidate, now: Date) => {
        const minutes = driveMinutesOf.get(c.id);
        if (minutes == null) return pFree(c.profile, now, c.capacity.value);
        const arrival = new Date(now.getTime() + minutes * 60_000);
        return pFree(c.profile, arrival, c.capacity.value, {
          arrivalNote: `acum + ${Math.round(minutes)} min de condus`,
        });
      };
  const ranked = rank({
    candidates: rankCandidates,
    walks: rankWalks,
    at,
    mode,
    // Each leg is already within the limit; the ranking walk is the sum of two legs.
    maxWalkMinutes: tours.size ? maxWalkMinutes * 2 : maxWalkMinutes,
    unknownPriceFloor,
    pFreeOf,
  });
  const considered = ranked.considered;
  const byId = new Map(candidates.map((candidate, i) => [candidate.id, drives[i]]));
  const options = ranked.options.map((option) => ({
    ...option,
    ...(tours.size ? { walk: walkOf.get(option.id)!, tour: tours.get(option.id)! } : {}),
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
    explanation: tourExplanation(explain(options), options[0]),
    model: {
      name: MODEL_SOURCE,
      quality: 'estimated',
      note: 'Nu există date de ocupare în timp real pentru Timișoara. Șansa de loc liber este o estimare după reguli, nu o măsurătoare.',
    },
    protectedZone: zoned.zone,
  };
  return body;
}

const r0 = (n: number) => Math.max(1, Math.round(n));
/** Template sentence for a tour (§6.19), from the computed legs only. */
function tourExplanation(base: string | null, best: RecommendationResponse['options'][number] | undefined) {
  if (!base || !best?.tour) return base;
  const legs = best.tour.legs.map((l) => `${l.to} ${r0(l.minutes)} min`).join(' → ');
  return `${base} Cu toate opririle parchezi o singură dată: ~${r0(best.tour.minutes)} min pe jos în total (${legs}).`;
}
