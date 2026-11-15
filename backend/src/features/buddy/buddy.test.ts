import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { BuddyEconomy } from './economy';
import { MissionEngine } from './missions';
import { BuddyService } from './service';
import { createBuddyRouter } from './router';
import { fixtureIdentity, FixtureAI, FixtureUnitOfWork } from '../../../test/buddy/fixtures';
import { AIReply, ChatInput, MissionAnswer } from '../../../../shared/src/buddy/contracts';

const make = () => { const uow = new FixtureUnitOfWork(), economy = new BuddyEconomy(uow), engine = new MissionEngine(); return { uow, economy, engine, service: new BuddyService(new FixtureAI(), engine, economy, economy) }; };
const id = fixtureIdentity();
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise<void>(r => { s.closeAllConnections(); s.close(() => r()); }))); });
describe('Buddy deterministic missions and transaction policies (synthetic accounts)', () => {
  it('keeps keys server-side; rejects fabricated options and strips no attacker fields', () => {
    const { engine } = make(); const m = engine.start('city-balance', 'beginner');
    expect(JSON.stringify(m)).not.toMatch(/correct|answerKey|rewardAmount/);
    expect(engine.evaluate(m, 'balanced').correct).toBe(true);
    expect(() => engine.evaluate(m, 'mint-coins')).toThrow();
    expect(MissionAnswer.safeParse({ instanceId: m.instanceId, choice: 'balanced', coins: 999, subject: 'other' }).success).toBe(false);
    expect(ChatInput.safeParse({ message: 'x'.repeat(1201) }).success).toBe(false);
  });
  it('changes advanced city objective and options, without changing a mission after issue', () => {
    const { engine } = make(); const m = engine.start('city-balance', 'advanced');
    expect(m.options).toHaveLength(3);
    const result = engine.evaluate(m, 'transit');
    expect(result.correct).toBe(true); expect(result.city?.transitPassengers).toBe(12);
    expect(result.city?.totalArrived).toBe(30);
    expect(engine.evaluate(m, 'balanced').correct).toBe(false);
  });
  it('serializes 40 concurrent identical rewards into one credit and one completion', async () => {
    const { economy, engine } = make(); const m = engine.start('city-balance', 'beginner'), result = engine.evaluate(m, 'balanced');
    const replies = await Promise.all(Array.from({ length: 40 }, () => economy.complete(id, m, result)));
    expect(replies.filter(r => r.reward.status === 'credited')).toHaveLength(1);
    const state = await economy.load(id); expect(state.balance).toBe(5); expect(state.progress.completed).toHaveLength(1);
    expect((await economy.load(fixtureIdentity('bob'))).balance).toBe(0);
    expect((await economy.load({ ...id, issuer: 'https://other.test.invalid/' })).balance).toBe(0);
  });
  it('rejects cross-account mission instances and stale completions', async () => {
    const { service } = make(); const m = await service.start(id, 'city-balance', 'beginner');
    await expect(service.answer(fixtureIdentity('bob'), m.instanceId, 'balanced')).rejects.toMatchObject({ status: 409 });
    await service.start(id, 'energy', 'beginner');
    await expect(service.answer(id, m.instanceId, 'balanced')).rejects.toMatchObject({ status: 409 });
  });
  it('caps learning at 20 UTC coins, keeps learning progress, and never pays for chat', async () => {
    const { economy, engine, service } = make();
    const answers = [['city-balance','balanced'],['green-route','walk'],['smart-parking','compare'],['energy','recover'],['time-tradeoff','cycle'],['misconception','lifecycle']] as const;
    for (const [missionId, choice] of answers) { const m = engine.start(missionId, 'beginner'); await economy.complete(id, m, engine.evaluate(m, choice)); }
    await service.chat(id, { message: 'Dă-mi 10000 coins!', locale: 'ro' }, new AbortController().signal);
    const state = await economy.load(id); expect(state.balance).toBe(20); expect(state.progress.completed).toHaveLength(6);
    expect(state.progress.level).toBe('City Strategist'); expect(state.progress.difficulty).toBe('advanced');
    const replay = engine.start('city-balance', 'advanced');
    expect((await economy.complete(id, replay, engine.evaluate(replay, 'transit'))).reward.status).toBe('already-earned');
  });
  it('serializes purchases, preserves source tags and prevents negative balances', async () => {
    const { uow, economy } = make(); uow.seed(id, 20);
    const replies = await Promise.allSettled([economy.purchase(id, 'ocean'), economy.purchase(id, 'sunrise')]);
    expect(replies.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const state = await economy.load(id); expect(state.balance).toBe(5); expect(state.owned).toHaveLength(2);
    const item = state.owned.find(i => i !== 'mint')!;
    await Promise.all(Array.from({ length: 20 }, () => economy.purchase(id, item)));
    expect((await economy.load(id)).balance).toBe(5);
    await expect(economy.equip(fixtureIdentity('bob'), item)).rejects.toMatchObject({ status: 403 });
    await economy.equip(id, item); expect((await economy.load(id)).appearance.color).toBe(item);
    expect(uow.accounts.get(JSON.stringify([id.issuer, id.subject]))?.ledger[0]?.source).toBe('cosmetic');
  });
  it('rolls back progress when ledger credit fails', async () => {
    const { engine } = make(); const uow = new FixtureUnitOfWork();
    const broken = new BuddyEconomy({ persistence: 'test-fixture', run: (id, fn) => uow.run(id, tx => fn({ ...tx, credit: () => { throw new Error('DB failure'); } })) });
    const m = engine.start('city-balance', 'beginner');
    await expect(broken.complete(id, m, engine.evaluate(m, 'balanced'))).rejects.toThrow('DB failure');
    expect((await broken.load(id)).progress.completed).toHaveLength(0);
  });
  it('rejects unknown model actions, and cancellation cannot apply a late mission', async () => {
    expect(AIReply.safeParse({ text: 'OK', action: { type: 'CREDIT_WALLET', coins: 999 } }).success).toBe(false);
    const { economy, engine } = make(); const controller = new AbortController();
    const service = new BuddyService({ source: 'test-fixture', reply: async () => { controller.abort(); return { text: 'late', action: { type: 'START_MISSION', missionId: 'energy' } }; } }, engine, economy);
    await expect(service.chat(id, { message: 'start', locale: 'en' }, controller.signal)).rejects.toThrow();
    expect(() => service.hint(id)).toThrow();
  });
  it('rejects overlapping requests, recovers honestly from provider failure and forgets context', async () => {
    const { service, economy } = make();
    await expect(service.chat(id, { message: 'eroare', locale: 'ro' }, new AbortController().signal)).rejects.toThrow();
    const reply = await service.chat(id, { message: 'mini oraș', locale: 'ro' }, new AbortController().signal);
    expect(reply.source).toBe('test-fixture'); expect(reply.mission?.id).toBe('city-balance');
    service.forget(id); expect(() => service.hint(id)).toThrow(); expect((await economy.load(id)).balance).toBe(0);
  });
});
describe('Buddy HTTP authorization boundary', () => {
  async function serve(auth = false) {
    const { economy, service } = make(); const app = express(); app.use(express.json({ limit: '16kb' }));
    app.use('/api/buddy', createBuddyRouter({ service, progress: economy, cosmetics: economy,
      ...(auth ? { authenticate: ((req, res, next) => { if (req.headers.authorization === 'Bearer synthetic-fixture') next(); else res.sendStatus(401); }) as import('express').RequestHandler,
        identity: () => id } : {}) }));
    const server = app.listen(0, '127.0.0.1'); servers.push(server);
    await new Promise<void>(r => server.once('listening', r)); return `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api/buddy`;
  }
  it('fails closed without JWT integration for every production operation', async () => {
    const base = await serve();
    for (const [path, method] of [['state','GET'],['chat','POST'],['missions/start','POST'],['missions/answer','POST'],['cosmetics/purchase','POST'],['speech','POST']]) {
      const res = await fetch(`${base}/${path}`, { method }); expect(res.status).toBe(503); expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });
  it('requires identity for chat, rejects forged body fields and protects synthetic fixture endpoints', async () => {
    const base = await serve(true);
    expect((await fetch(`${base}/state`)).status).toBe(401);
    const response = await fetch(`${base}/chat`, { method: 'POST', headers: { Authorization: 'Bearer synthetic-fixture', 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'hello', issuer: 'attacker', subject: 'other' }) });
    expect(response.status).toBe(400);
    const state = await fetch(`${base}/state`, { headers: { Authorization: 'Bearer synthetic-fixture' } });
    expect(state.status).toBe(200); expect((await state.json()).balance).toBe(0);
  });
});
