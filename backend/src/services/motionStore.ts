import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  evaluateMotion,
  MOTION_RULES,
  MotionEvaluation,
  MotionMode,
  WalletTransaction,
  type MotionPoint,
  type MotionResult,
  type MotionWallet,
} from '@vlaiq/shared';
import { COSMETICS, MissionId } from '../../../shared/src/buddy/contracts';

const Activity = z.object({
  id: z.string().uuid(),
  mode: MotionMode,
  startedAt: z.number(),
  state: z.enum(['recording', 'completed', 'cancelled']),
  evaluation: MotionEvaluation.optional(),
  digest: z.string().optional(),
});
const Owner = z.object({
  activities: z.array(Activity),
  ledger: z.array(WalletTransaction),
});
const Database = z.record(Owner);
const day = (timestamp: number) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(timestamp);

export const MOTION_RETENTION_DAYS = MOTION_RULES.retentionDays;
const RETENTION_MS = MOTION_RETENTION_DAYS * 86400000;

/** Single-process prototype ledger. Only summaries/digests persist, never GPS coordinates. */
export class MotionStore {
  private data: z.infer<typeof Database>;
  constructor(
    private file: string | null,
    now = Date.now(),
  ) {
    this.data =
      file && existsSync(file) ? Database.parse(JSON.parse(readFileSync(file, 'utf8'))) : {};
    this.purgeInactive(now);
  }
  static fromSnapshot(snapshot: unknown) {
    const store = new MotionStore(null);
    store.data = Database.parse(snapshot);
    store.purgeInactive();
    return store;
  }
  snapshot() {
    return structuredClone(this.data);
  }
  /** Deletes wallets whose last activity or reward is older than the retention period. */
  purgeInactive(now = Date.now()) {
    const stale = Object.entries(this.data)
      .filter(([, user]) => {
        const last = Math.max(
          0,
          ...user.activities.map((a) => a.startedAt),
          ...user.ledger.map((t) => t.awardedAt),
        );
        return now - last > RETENTION_MS;
      })
      .map(([owner]) => owner);
    if (!stale.length) return 0;
    const next = structuredClone(this.data);
    for (const owner of stale) delete next[owner];
    this.save(next);
    return stale.length;
  }
  /** Right to erasure: removes every activity and reward for this wallet owner. */
  erase(owner: string) {
    if (!this.data[owner]) return false;
    const next = structuredClone(this.data);
    delete next[owner];
    this.save(next);
    return true;
  }
  private save(next: z.infer<typeof Database>) {
    if (!this.file) {
      this.data = next;
      return;
    }
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(next), { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
    this.data = next;
  }
  wallet(owner: string, now = Date.now()): MotionWallet {
    const transactions = this.data[owner]?.ledger ?? [];
    const daily = transactions.filter((t) => t.source === 'browser-gps-plausibility' && day(t.awardedAt) === day(now));
    const balance = transactions.reduce((sum, t) => sum + t.coins, 0);
    return {
      balance,
      lifetime: transactions.reduce((sum, t) => sum + Math.max(0, t.coins), 0),
      transactions: [...transactions].reverse(),
      dailyEarned: daily.reduce((s, t) => s + t.coins, 0),
      todayActivities: daily.length,
    };
  }
  activities(owner: string) {
    return (this.data[owner]?.activities ?? []).map(({ digest, ...summary }) => summary).reverse();
  }
  /** Called only inside the same locked account transaction as Buddy progress. */
  buddyCredit(owner: string, coins: number, key: string, now = Date.now()) {
    const match = /^buddy:([a-z-]+):v(\d+)$/.exec(key);
    const missionId = MissionId.parse(match?.[1]);
    const version = Number(match?.[2]);
    if (coins !== 5 || version !== 1) throw new Error('Invalid educational reward');
    const next = structuredClone(this.data), user = next[owner] ??= { activities: [], ledger: [] };
    if (user.ledger.some(t => 'idempotencyKey' in t && t.idempotencyKey === key)) throw Object.assign(new Error('Lecție deja recompensată.'), { status: 409 });
    const utcDay = new Date(now).toISOString().slice(0, 10);
    const earned = user.ledger.filter(t => t.source === 'education' && new Date(t.awardedAt).toISOString().slice(0, 10) === utcDay).reduce((n,t) => n + t.coins, 0);
    if (earned + coins > 20) throw Object.assign(new Error('Limita educațională a fost atinsă.'), { status: 409 });
    user.ledger.push({ id: randomUUID(), source: 'education', coins, awardedAt: now, missionId, definitionVersion: version, idempotencyKey: key, reason: 'Lecție FLOW Buddy validată determinist pe server.' });
    this.save(next);
  }
  buddySpend(owner: string, coins: number, key: string, now = Date.now()) {
    const item = COSMETICS.find(c => key === `buddy:cosmetic:${c.id}`);
    if (!item || item.price <= 0 || coins !== item.price) throw new Error('Invalid cosmetic price');
    if (this.wallet(owner, now).balance < coins) throw Object.assign(new Error('Nu ai suficiente FLOW Coins.'), { status: 409 });
    const next = structuredClone(this.data), user = next[owner] ??= { activities: [], ledger: [] };
    if (user.ledger.some(t => 'idempotencyKey' in t && t.idempotencyKey === key)) throw Object.assign(new Error('Accesoriu deja cumpărat.'), { status: 409 });
    user.ledger.push({ id: randomUUID(), source: 'cosmetic', coins: -coins, awardedAt: now, cosmeticId: item.id, idempotencyKey: key, reason: `Buddy Workshop · ${item.name}` });
    this.save(next);
  }
  start(owner: string, mode: MotionMode, now = Date.now()) {
    this.purgeInactive(now);
    const next = structuredClone(this.data);
    const user = (next[owner] ??= { activities: [], ledger: [] });
    for (const activity of user.activities)
      if (activity.state === 'recording') activity.state = 'cancelled';
    const activity = {
      id: randomUUID(),
      mode,
      startedAt: now,
      state: 'recording' as const,
    };
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
      return {
        evaluation: activity.evaluation,
        wallet: this.wallet(owner, now),
      };
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
    evaluation = {
      ...evaluation,
      coins: Math.min(evaluation.coins, remaining),
    };
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
