import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  evaluateMotion,
  MOTION_RULES,
  MotionEvaluation,
  MotionMode,
  MotionTransaction,
  type MotionPoint,
  type MotionResult,
  type MotionWallet,
} from '@vlaiq/shared';

const Activity = z.object({
  id: z.string().uuid(),
  mode: MotionMode,
  startedAt: z.number(),
  state: z.enum(['recording', 'completed', 'cancelled']),
  evaluation: MotionEvaluation.optional(),
  digest: z.string().optional(),
});
const Owner = z.object({ activities: z.array(Activity), ledger: z.array(MotionTransaction) });
const Database = z.record(Owner);
const day = (timestamp: number) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(timestamp);

/** Single-process prototype ledger. Only summaries/digests persist, never GPS coordinates. */
export class MotionStore {
  private data: z.infer<typeof Database>;
  constructor(private file: string) {
    this.data = existsSync(file) ? Database.parse(JSON.parse(readFileSync(file, 'utf8'))) : {};
  }
  private save(next: z.infer<typeof Database>) {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(next), { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
    this.data = next;
  }
  wallet(owner: string, now = Date.now()): MotionWallet {
    const transactions = this.data[owner]?.ledger ?? [];
    const daily = transactions.filter((t) => day(t.awardedAt) === day(now));
    const balance = transactions.reduce((sum, t) => sum + t.coins, 0);
    return {
      balance,
      lifetime: balance,
      transactions: [...transactions].reverse(),
      dailyEarned: daily.reduce((s, t) => s + t.coins, 0),
      todayActivities: daily.length,
    };
  }
  start(owner: string, mode: MotionMode, now = Date.now()) {
    const next = structuredClone(this.data);
    const user = (next[owner] ??= { activities: [], ledger: [] });
    for (const activity of user.activities)
      if (activity.state === 'recording') activity.state = 'cancelled';
    const activity = { id: randomUUID(), mode, startedAt: now, state: 'recording' as const };
    user.activities.push(activity);
    this.save(next);
    return { id: activity.id, startedAt: now };
  }
  cancel(owner: string, id: string) {
    const next = structuredClone(this.data),
      activity = next[owner]?.activities.find((a) => a.id === id);
    if (!activity) throw new Error('Activitate inexistentă.');
    if (activity.state === 'recording') {
      activity.state = 'cancelled';
      this.save(next);
    }
  }
  finish(owner: string, id: string, points: MotionPoint[], now = Date.now()): MotionResult {
    const next = structuredClone(this.data),
      user = next[owner],
      activity = user?.activities.find((a) => a.id === id);
    if (!activity || !user) throw new Error('Activitate inexistentă.');
    if (activity.state === 'cancelled') throw new Error('Activitatea a fost anulată.');
    if (activity.evaluation)
      return { evaluation: activity.evaluation, wallet: this.wallet(owner, now) };
    let evaluation = evaluateMotion(activity.mode, points);
    const digest = createHash('sha256').update(JSON.stringify(points)).digest('hex');
    if (
      now - activity.startedAt < MOTION_RULES.minSeconds * 1000 ||
      now - activity.startedAt > 14400000 ||
      points.some((p) => p.timestamp < activity.startedAt - 3000 || p.timestamp > now + 3000) ||
      user.activities.some((a) => a.digest === digest)
    ) {
      evaluation = {
        ...evaluation,
        status: 'rejected',
        coins: 0,
        reason: 'Durata sesiunii sau observațiile nu corespund înregistrării de pe server.',
      };
    }
    const remaining = Math.max(0, MOTION_RULES.dailyCap - this.wallet(owner, now).dailyEarned);
    evaluation = { ...evaluation, coins: Math.min(evaluation.coins, remaining) };
    if (evaluation.status === 'eligible' && remaining === 0)
      evaluation.reason = 'Activitate eligibilă. Limita zilnică de 80 FLOW Coins a fost atinsă.';
    activity.evaluation = evaluation;
    activity.state = 'completed';
    activity.digest = digest;
    if (evaluation.coins > 0)
      user.ledger.push({
        id: randomUUID(),
        activityId: id,
        coins: evaluation.coins,
        awardedAt: now,
        mode: activity.mode,
        distance: evaluation.distance,
        seconds: evaluation.seconds,
        source: 'browser-gps-plausibility',
        reason: evaluation.reason,
      });
    this.save(next);
    return { evaluation, wallet: this.wallet(owner, now) };
  }
}
