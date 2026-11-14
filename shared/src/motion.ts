import { z } from 'zod';

export const MotionMode = z.enum(['walk', 'run', 'cycle']);
export type MotionMode = z.infer<typeof MotionMode>;
export const MotionPoint = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().finite().nonnegative().max(10000),
    timestamp: z.number().int().positive(),
    segment: z.number().int().nonnegative().max(1000),
  })
  .strict();
export type MotionPoint = z.infer<typeof MotionPoint>;
export const MotionSubmission = z
  .object({ id: z.string().uuid(), points: z.array(MotionPoint).max(2000) })
  .strict();
export const MotionEvaluation = z.object({
  status: z.enum(['eligible', 'unverified', 'rejected']),
  distance: z.number(),
  seconds: z.number(),
  displacement: z.number(),
  discarded: z.number(),
  coins: z.number().int(),
  reason: z.string(),
});
export type MotionEvaluation = z.infer<typeof MotionEvaluation>;
export const MotionTransaction = z.object({
  id: z.string().uuid(),
  activityId: z.string().uuid(),
  coins: z.number().int().nonnegative(),
  awardedAt: z.number(),
  mode: MotionMode,
  distance: z.number(),
  seconds: z.number(),
  source: z.literal('browser-gps-plausibility'),
  reason: z.string(),
});
export const MotionWallet = z.object({
  balance: z.number().int(),
  lifetime: z.number().int(),
  dailyEarned: z.number().int(),
  transactions: z.array(MotionTransaction),
  todayActivities: z.number().int(),
});
export type MotionWallet = z.infer<typeof MotionWallet>;
export const MotionResult = z.object({ evaluation: MotionEvaluation, wallet: MotionWallet });
export type MotionResult = z.infer<typeof MotionResult>;
/** Prototype product rules, not scientific activity recognition or emission factors. */
export const MOTION_RULES = {
  minSeconds: 90,
  accuracy: 35,
  maxGapSeconds: 25,
  minDisplacement: 80,
  minDistance: { walk: 150, run: 150, cycle: 300 },
  maxSpeed: { walk: 3.2, run: 7, cycle: 16 },
  baseCoins: 10,
  coinsPer250m: 5,
  sessionCap: 40,
  dailyCap: 80,
  /** Wallets with no activity for this long are deleted on the server (stated on the privacy page). */
  retentionDays: 365,
} as const;
export const motionNames: Record<MotionMode, string> = {
  walk: 'Mers pe jos',
  run: 'Alergare',
  cycle: 'Bicicletă',
};

export function motionDistance(a: MotionPoint, b: MotionPoint) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 12742000 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/** Deterministic plausibility evaluation. Browser GPS is not hardware-attested evidence. */
export function evaluateMotion(mode: MotionMode, points: MotionPoint[]): MotionEvaluation {
  let anchor: MotionPoint | undefined,
    previous: MotionPoint | undefined,
    first: MotionPoint | undefined;
  let distance = 0,
    seconds = 0,
    discarded = 0,
    displacement = 0;
  for (const p of points) {
    if (p.accuracy > MOTION_RULES.accuracy) {
      discarded++;
      continue;
    }
    if (previous && p.timestamp <= previous.timestamp) {
      discarded++;
      continue;
    }
    if (
      !previous ||
      previous.segment !== p.segment ||
      (p.timestamp - previous.timestamp) / 1000 > MOTION_RULES.maxGapSeconds
    ) {
      anchor = p;
      previous = p;
      first = p;
      continue;
    }
    const dt = (p.timestamp - previous.timestamp) / 1000;
    if (motionDistance(previous, p) / dt > MOTION_RULES.maxSpeed[mode]) {
      discarded++;
      continue;
    }
    seconds += dt;
    previous = p;
    first ??= p;
    displacement = Math.max(displacement, motionDistance(first, p));
    const d = anchor ? motionDistance(anchor, p) : 0;
    // Ignore jitter inside the uncertainty area; accelerometer shaking adds no distance.
    if (anchor && d >= Math.max(6, (anchor.accuracy + p.accuracy) * 0.6)) {
      distance += d;
      anchor = p;
    }
  }
  const eligible =
    points.length >= 6 &&
    seconds >= MOTION_RULES.minSeconds &&
    distance >= MOTION_RULES.minDistance[mode] &&
    displacement >= MOTION_RULES.minDisplacement &&
    discarded <= points.length * 0.2;
  const status = eligible
    ? 'eligible'
    : discarded > points.length * 0.5 && points.length > 0
      ? 'rejected'
      : 'unverified';
  const coins = eligible
    ? Math.min(
        MOTION_RULES.sessionCap,
        MOTION_RULES.baseCoins + Math.floor(distance / 250) * MOTION_RULES.coinsPer250m,
      )
    : 0;
  return {
    status,
    distance: Math.round(distance),
    seconds: Math.round(seconds),
    displacement: Math.round(displacement),
    discarded,
    coins,
    reason: eligible
      ? 'Deplasare GPS plauzibilă · evaluare de prototip'
      : discarded > points.length * 0.2
        ? 'Prea multe observații GPS imprecise sau deplasări neverosimile.'
        : 'Sunt necesare minimum 90 s de observații valide și o deplasare de minimum 150 m (300 m cu bicicleta).',
  };
}
