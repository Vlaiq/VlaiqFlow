import { z } from 'zod';
import { Coordinate, NavigationRoute } from './navigation';
import { DataQuality } from './quality';
import { JourneyPreference } from './journey';
import { CandidateKind } from './recommendation';
import { TariffColor } from './timpark';

export const JourneyCategory = z.enum(['car_park_walk', 'walk', 'cycle']);
export type JourneyCategory = z.infer<typeof JourneyCategory>;
const metric = <T extends 'm' | 's'>(unit: T) =>
  z
    .object({
      value: z.number().finite().nonnegative().nullable(),
      unit: z.literal(unit),
      quality: DataQuality,
      source: z.string().min(1),
    })
    .refine(
      (m) => (m.value === null) === (m.quality === 'unknown'),
      'Unknown must be null; known must have a value',
    );
export const DistanceMetric = metric('m');
export const DurationMetric = metric('s');
export const JourneyMoney = z
  .object({
    minorUnits: z.number().int().nonnegative().nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    quality: DataQuality,
    source: z.string().min(1),
    note: z.string(),
  })
  .refine(
    (m) =>
      m.minorUnits === null
        ? m.quality === 'unknown'
        : m.quality !== 'unknown' && (m.minorUnits === 0 || m.currency !== null),
    'Missing price stays unknown',
  );
const moving = {
  id: z.string().min(1),
  from: Coordinate,
  to: Coordinate,
  distance: DistanceMetric,
  duration: DurationMetric,
  route: NavigationRoute,
  warnings: z.array(z.string()),
};
export const JourneyLeg = z.discriminatedUnion('type', [
  z.object({ ...moving, type: z.literal('drive'), profile: z.literal('driving-car') }),
  z.object({ ...moving, type: z.literal('walk'), profile: z.literal('foot-walking') }),
  z.object({ ...moving, type: z.literal('cycle'), profile: z.literal('cycling-regular') }),
  z.object({
    id: z.string().min(1),
    type: z.literal('parking'),
    from: Coordinate,
    to: Coordinate,
    duration: DurationMetric,
    warnings: z.array(z.string()),
  }),
]);
export type JourneyLeg = z.infer<typeof JourneyLeg>;
export const ParkingMatch = z.object({
  /** 1 = best car option of this response, after SmartMatch cost + driving minutes. */
  rank: z.number().int().positive(),
  kind: CandidateKind,
  tariff: TariffColor.nullable(),
  smsCode: z.string().nullable(),
  capacity: z.object({
    value: z.number().int().positive().nullable(),
    quality: DataQuality,
    source: z.string(),
  }),
  freeChance: z.object({
    value: z.number().min(0).max(1),
    quality: z.enum(['estimated', 'simulated']),
    source: z.string().min(1),
    factors: z.array(z.string()),
  }),
  /** Ranking cost in minute-equivalents; lower is better. `drive` is null when no driving time is known. */
  score: z.object({
    total: z.number().finite(),
    walk: z.number().finite(),
    risk: z.number().finite(),
    price: z.number().finite(),
    drive: z.number().finite().nonnegative().nullable(),
  }),
});
export type ParkingMatch = z.infer<typeof ParkingMatch>;
export const CompleteJourney = z
  .object({
    id: z.string().min(1),
    origin: Coordinate,
    destination: Coordinate,
    category: JourneyCategory,
    legs: z.array(JourneyLeg).min(1).max(3),
    travelSeconds: DurationMetric,
    distance: DistanceMetric,
    elapsedSeconds: DurationMetric,
    parking: z
      .object({
        id: z.string(),
        name: z.string(),
        coordinate: Coordinate,
        access: z.enum(['public', 'unknown']),
        availability: z.object({
          value: z.null(),
          quality: z.literal('unknown'),
          source: z.string(),
        }),
        fee: JourneyMoney,
        stayMinutes: z.number().int().positive(),
        tariffAt: z.string().datetime(),
        source: z.string(),
        warnings: z.array(z.string()),
        /**
         * SmartMatch facts for this parking, computed by the deterministic engine. `freeChance` is the
         * rule-model estimate (never 'confirmed'); `availability` above stays the live value, which is unknown.
         */
        match: ParkingMatch,
      })
      .nullable(),
    practical: z.boolean(),
    calculatedAt: z.string().datetime(),
    limitations: z.array(z.string()),
  })
  .superRefine((j, ctx) => {
    const expected = j.category === 'car_park_walk' ? ['drive', 'parking', 'walk'] : [j.category];
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (JSON.stringify(j.legs.map((l) => l.type)) !== JSON.stringify(expected))
      fail('Invalid leg order');
    const equal = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);
    if (!equal(j.legs[0]!.from, j.origin) || !equal(j.legs.at(-1)!.to, j.destination))
      fail('Journey endpoints do not match');
    j.legs.forEach((leg, i) => {
      if (i && !equal(j.legs[i - 1]!.to, leg.from)) fail('Disconnected legs');
      if (leg.type === 'parking') {
        if (leg.duration.value !== null || !equal(leg.from, leg.to))
          fail('Parking overhead is unknown');
      } else if (
        leg.duration.value !== leg.route.duration ||
        leg.distance.value !== leg.route.distance
      )
        fail('Leg metrics differ from provider');
    });
    const moves = j.legs.filter((l) => l.type !== 'parking');
    if (
      j.travelSeconds.value !== moves.reduce((n, l) => n + l.route.duration, 0) ||
      j.distance.value !== moves.reduce((n, l) => n + l.route.distance, 0)
    )
      fail('Totals differ from legs');
    if (j.category === 'car_park_walk') {
      if (
        !j.parking ||
        !equal(j.legs[0]!.to, j.parking.coordinate) ||
        j.elapsedSeconds.value !== null
      )
        fail('Car journey needs parking and unknown elapsed overhead');
    } else if (j.parking || j.elapsedSeconds.value !== j.travelSeconds.value)
      fail('Active journey has no parking overhead');
  });
export type CompleteJourney = z.infer<typeof CompleteJourney>;
export const CompleteJourneyRequest = z
  .object({
    origin: Coordinate,
    destination: Coordinate,
    arriveAt: z.string().datetime({ offset: true }).optional(),
    stayMinutes: z.number().int().min(15).max(600).default(120),
    maxWalkMinutes: z.number().int().min(2).max(20).default(12),
    parkingPreference: z.enum(['balanced', 'cheap', 'less_walk']).default('balanced'),
    preference: JourneyPreference.default('balanced'),
    modes: z
      .array(JourneyCategory)
      .min(1)
      .max(3)
      .refine((v) => new Set(v).size === v.length)
      .default(['car_park_walk', 'walk', 'cycle']),
  })
  .strict();
export type CompleteJourneyRequest = z.infer<typeof CompleteJourneyRequest>;
const ranking = z.object({
  ids: z.array(z.string()),
  recommendedId: z.string().nullable(),
  explanation: z.string(),
});
export const CompleteJourneyResponse = z
  .object({
    journeys: z.array(CompleteJourney).max(5),
    rankings: z.object({ fastest: ranking, balanced: ranking, green: ranking }),
    unavailable: z.array(z.object({ category: JourneyCategory, reason: z.string() })),
    opportunity: z
      .object({ journeyId: z.string(), extraSeconds: z.number().finite(), explanation: z.string() })
      .nullable(),
    calculatedAt: z.string().datetime(),
    coverage: z.string(),
    limitations: z.array(z.string()),
  })
  .superRefine((r, ctx) => {
    const ids = new Set(r.journeys.map((j) => j.id));
    if (
      ids.size !== r.journeys.length ||
      Object.values(r.rankings).some(
        (k) =>
          (k.recommendedId !== null && !ids.has(k.recommendedId)) ||
          k.ids.length !== ids.size ||
          new Set(k.ids).size !== ids.size ||
          k.ids.some((id) => !ids.has(id)),
      ) ||
      (r.opportunity &&
        !r.journeys.some(
          (j) => j.id === r.opportunity!.journeyId && j.category !== 'car_park_walk',
        ))
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid ranking or opportunity references' });
  });
export type CompleteJourneyResponse = z.infer<typeof CompleteJourneyResponse>;

/** Planned context only. Never accepted as recorded activity by the rewards endpoint. */
export const ActiveJourneyContext = z
  .object({
    id: z.string(),
    mode: z.enum(['walk', 'cycle']),
    destinationId: z.string(),
    destinationName: z.string(),
    distance: z.number().finite().positive(),
    duration: z.number().finite().positive(),
    source: z.string().min(1),
    calculatedAt: z.string().datetime(),
  })
  .strict();
export type ActiveJourneyContext = z.infer<typeof ActiveJourneyContext>;
