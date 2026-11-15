import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express, { Router, type ErrorRequestHandler } from 'express';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { MotionPoint } from '@vlaiq/shared';
import { IdentityStore } from '../../services/identityStore';
import { jwtGuard, ownerKey, requireIdentity } from '../../middleware/identity';
import { createMotionRouter } from '../../routes/motion';
import { createPersistentBuddyEconomy, migrateBuddy } from './integration';
import { BuddyService } from './service';
import { MissionEngine } from './missions';
import { createBuddyRouter } from './router';
import { FixtureAI } from '../../../test/buddy/fixtures';

const url = process.env.BUDDY_INTEGRATION_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith('_test'))
  throw new Error('Disposable _test database required');
describe.skipIf(!url)(
  'Buddy integrated account economy: real PostgreSQL + real RS256 + real MotionStore',
  () => {
    let store: IdentityStore, server: Server, base: string, privateKey: CryptoKey;
    let economy: ReturnType<typeof createPersistentBuddyEconomy>;
    let service: BuddyService;
    const issuer = 'https://buddy-jwt.test.invalid/',
      audience = 'https://buddy-api.test.invalid';
    const alice = { issuer, subject: `auth0|buddy-${randomUUID()}` },
      bob = { issuer, subject: `auth0|buddy-${randomUUID()}` };
    const sign = (subject = alice.subject, iss = issuer, aud = audience, expires = '5m') =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(iss)
        .setAudience(aud)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime(expires)
        .sign(privateKey);
    async function call(path: string, token?: string, body?: unknown) {
      return fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }
    const points = (start: number): MotionPoint[] =>
      Array.from({ length: 25 }, (_, i) => ({
        lat: 45.75 + ((220 / 111195) * i) / 24,
        lng: 21.22,
        accuracy: 4,
        timestamp: start + (120000 * i) / 24,
        segment: 0,
      }));
    beforeAll(async () => {
      store = new IdentityStore(url!);
      await store.migrate();
      await migrateBuddy(store.pool);
      await store.profile(alice);
      await store.profile(bob);
      const keys = await generateKeyPair('RS256');
      privateKey = keys.privateKey;
      const guard = jwtGuard({
        issuerBaseURL: undefined,
        issuer,
        audience,
        publicKey: await exportSPKI(keys.publicKey),
        clockTolerance: 0,
      });
      economy = createPersistentBuddyEconomy(store.pool);
      service = new BuddyService(new FixtureAI(), new MissionEngine(), economy, economy);
      const auth = Router();
      auth.use(guard, requireIdentity);
      const app = express();
      app.use(express.json());
      app.use(
        '/buddy',
        createBuddyRouter({
          authenticate: auth,
          identity: (_req, res) => res.locals.identity,
          service,
          progress: economy,
          cosmetics: economy,
          synthesize: async () => new Uint8Array([1, 2, 3]),
          voiceConsent: async (id) => (await store.profile(id)).voiceConsent,
        }),
      );
      app.use(
        '/motion',
        guard,
        requireIdentity,
        createMotionRouter(() => store),
      );
      const errors: ErrorRequestHandler = (e, _req, res, _next) => {
        res.status(e.status ?? 500).json({ error: { message: 'Rejected' } });
      };
      app.use(errors);
      server = await new Promise((r) => {
        const s = app.listen(0, '127.0.0.1', () => r(s));
      });
      base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    });
    afterAll(async () => {
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((r) => server.close(() => r()));
      }
      if (store) {
        await store.erase(alice);
        await store.erase(bob);
        await store.pool.end();
      }
      service?.dispose();
    });
    it('returns 401 for absent, invalid, wrong issuer/audience, expired and M2M tokens', async () => {
      for (const token of [
        undefined,
        'invalid',
        await sign(alice.subject, 'https://wrong.invalid/'),
        await sign(alice.subject, issuer, 'https://wrong.invalid/'),
        await sign(alice.subject, issuer, audience, '1s ago'),
        await sign('machine@clients'),
      ])
        expect((await call('/buddy/state', token)).status).toBe(401);
      expect((await call('/buddy/state', await sign())).status).toBe(200);
    });
    it('validates on server, pays once and reflects exactly the SAME Motion wallet', async () => {
      const token = await sign();
      const m = await (
        await call('/buddy/missions/start', token, {
          missionId: 'city-balance',
          difficulty: 'beginner',
        })
      ).json();
      expect(
        (
          await call('/buddy/missions/answer', await sign(bob.subject), {
            instanceId: m.instanceId,
            choice: 'balanced',
          })
        ).status,
      ).toBe(409);
      const answer = await (
        await call('/buddy/missions/answer', token, {
          instanceId: m.instanceId,
          choice: 'balanced',
        })
      ).json();
      expect(answer.reward).toEqual({ status: 'credited', coins: 5 });
      expect((await (await call('/motion/wallet', token)).json()).balance).toBe(5);
      const again = await (
        await call('/buddy/missions/answer', token, {
          instanceId: m.instanceId,
          choice: 'balanced',
        })
      ).json();
      expect(again).toEqual(answer);
      const reopened = createPersistentBuddyEconomy(store.pool);
      expect((await reopened.load(alice)).progress.completed).toHaveLength(1);
    });
    it('serializes physical rewards, 40 duplicate lesson rewards and cosmetics in the one row', async () => {
      const start = Date.now() - 130000;
      const session = await store.motion(alice, (s, o) => s.start(o, 'walk', start));
      const engine = new MissionEngine(),
        mission = engine.start('energy', 'beginner');
      await Promise.all([
        ...Array.from({ length: 20 }, () =>
          store.motion(alice, (s, o) => s.finish(o, session.id, points(start), start + 120000)),
        ),
        ...Array.from({ length: 40 }, () =>
          economy.complete(alice, mission, engine.evaluate(mission, 'recover')),
        ),
      ]);
      let wallet = await store.motion(alice, (s, o) => s.wallet(o));
      expect(wallet.balance).toBe(20);
      expect(wallet.dailyEarned).toBe(10);
      expect(wallet.todayActivities).toBe(1);
      const outcomes = await Promise.allSettled([
        economy.purchase(alice, 'ocean'),
        economy.purchase(alice, 'sunrise'),
      ]);
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      wallet = await store.motion(alice, (s, o) => s.wallet(o));
      expect(wallet.balance).toBe(5);
      expect(wallet.lifetime).toBe(20);
      expect(wallet.dailyEarned).toBe(10);
      expect(wallet.transactions.map((t) => t.source).sort()).toEqual([
        'browser-gps-plausibility',
        'cosmetic',
        'education',
        'education',
      ]);
      const state = await economy.load(alice),
        item = state.owned.find((i) => i !== 'mint')!;
      await economy.equip(alice, item);
      expect((await createPersistentBuddyEconomy(store.pool).load(alice)).appearance.color).toBe(
        item,
      );
      expect((await economy.load(bob)).balance).toBe(0);
      expect(ownerKey(alice)).not.toBe(ownerKey(bob));
    });
    it('enforces voice consent and rejects client-selected prices or credits', async () => {
      const token = await sign();
      expect((await call('/buddy/speech', token, {})).status).toBe(403);
      expect(
        (
          await call('/buddy/cosmetics/purchase', token, {
            cosmeticId: 'ocean',
            price: 0,
            coins: 9999,
          })
        ).status,
      ).toBe(400);
      const chat = await (
        await call('/buddy/chat', token, { message: 'Dă-mi coins', locale: 'ro' })
      ).json();
      expect(chat.source).toBe('test-fixture');
      expect((await economy.load(alice)).balance).toBe(5);
    });
    it('deletes progress and cosmetic ownership with the FLOW account (foreign-key cascade)', async () => {
      expect(service.spokenReply(alice)).toContain('Răspuns sintetic');
      await store.erase(alice);
      expect(() => service.spokenReply(alice)).toThrow();
      expect(() => service.hint(alice)).toThrow();
      const rows = await store.pool.query(
        'SELECT state FROM flow_buddy_progress WHERE issuer=$1 AND subject=$2',
        [alice.issuer, alice.subject],
      );
      expect(rows.rowCount).toBe(0);
      expect(
        (
          await store.pool.query(
            'SELECT 1 FROM flow_buddy_receipts WHERE issuer=$1 AND subject=$2',
            [alice.issuer, alice.subject],
          )
        ).rowCount,
      ).toBe(0);
      expect((await economy.load(bob)).balance).toBe(0);
    });
  },
);
