import { readFile } from 'node:fs/promises';
import { Router } from 'express';
import { config } from '../../config';
import { jwtGuard, ownerKey, requireIdentity } from '../../middleware/identity';
import { identityStore } from '../../services/identityStore';
import { MotionStore } from '../../services/motionStore';
import type { BuddyAIService } from '../../../../shared/src/buddy/contracts';
import { BuddyEconomy } from './economy';
import { GeminiBuddy } from './gemini';
import { BuddySpeech } from './elevenSpeech';
import { MissionEngine } from './missions';
import { PostgresBuddyUnitOfWork, type BuddyLedgerFactory, type BuddySqlPool } from './postgres';
import { createBuddyRouter } from './router';
import { BuddyService } from './service';

export const flowBuddyLedger: BuddyLedgerFactory = (snapshot, identity) => {
  const store = MotionStore.fromSnapshot(snapshot),
    owner = ownerKey(identity);
  return {
    balance: () => store.wallet(owner).balance,
    credit: (n, k) => store.buddyCredit(owner, n, k),
    spend: (n, k) => store.buddySpend(owner, n, k),
    snapshot: () => store.snapshot(),
  };
};
export const createPersistentBuddyEconomy = (pool: BuddySqlPool) =>
  new BuddyEconomy(new PostgresBuddyUnitOfWork(pool, flowBuddyLedger));
export async function migrateBuddy(pool: { query(sql: string): Promise<unknown> }) {
  await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
}
export function createIntegratedBuddyRouter() {
  const economy = new BuddyEconomy({
    persistence: 'account',
    run: (id, fn) => new PostgresBuddyUnitOfWork(identityStore().pool, flowBuddyLedger).run(id, fn),
  });
  let gemini: GeminiBuddy | null = null;
  const ai: BuddyAIService = {
    source: 'gemini',
    reply: (...args) => {
      if (!config.geminiApiKey) throw new Error('Gemini not configured');
      gemini ??= new GeminiBuddy(config.geminiApiKey, config.buddyGeminiModel);
      return gemini.reply(...args);
    },
  };
  const service = new BuddyService(ai, new MissionEngine(), economy, economy);
  const speech = config.elevenLabsApiKey
    ? new BuddySpeech(config.elevenLabsApiKey, config.buddyVoiceId)
    : null;
  const auth = Router();
  auth.use(jwtGuard(), requireIdentity);
  return createBuddyRouter({
    authenticate: auth,
    identity: (_req, res) => res.locals.identity ?? null,
    service,
    progress: economy,
    cosmetics: economy,
    // Identity is populated exclusively by the reviewed strict host JWT middleware.
    ...(speech
      ? {
          synthesize: (text, signal) => speech.synthesize(text, signal),
          voiceConsent: async (id) => (await identityStore().profile(id)).voiceConsent,
        }
      : {}),
  });
}
