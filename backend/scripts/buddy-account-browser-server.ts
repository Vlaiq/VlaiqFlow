// TEST ONLY: real PostgreSQL/host handlers/local RS256, synthetic SDK + AI. No production bypass.
import express, { Router, type ErrorRequestHandler } from 'express';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import { writeFile } from 'node:fs/promises';
import { jwtGuard, requireIdentity } from '../src/middleware/identity';
import { IdentityStore } from '../src/services/identityStore';
import { createIdentityRouter } from '../src/routes/identity';
import { createMotionRouter } from '../src/routes/motion';
import { createPersistentBuddyEconomy, migrateBuddy } from '../src/features/buddy/integration';
import { BuddyService } from '../src/features/buddy/service';
import { MissionEngine } from '../src/features/buddy/missions';
import { createBuddyRouter } from '../src/features/buddy/router';
import { FixtureAI } from '../test/buddy/fixtures';
const url = process.env.BUDDY_INTEGRATION_DATABASE_URL;
if (
  process.env.NODE_ENV !== 'test' ||
  process.env.BUDDY_FIXTURES !== '1' ||
  !url ||
  !new URL(url).pathname.endsWith('_test')
)
  throw new Error('Explicit isolated _test fixture mode required');
const store = new IdentityStore(url);
await store.migrate();
await migrateBuddy(store.pool);
const issuer = 'https://buddy-account-browser.test.invalid/',
  audience = 'https://buddy-browser-api.test.invalid';
const keys = await generateKeyPair('RS256');
const guard = jwtGuard({
  issuerBaseURL: undefined,
  issuer,
  audience,
  publicKey: await exportSPKI(keys.publicKey),
});
const accounts = await Promise.all(
  ['alice', 'bob'].map(async (suffix) => ({
    subject: `auth0|buddy-browser-${suffix}`,
    token: await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(`auth0|buddy-browser-${suffix}`)
      .setExpirationTime('1h')
      .sign(keys.privateKey),
  })),
);
for (const a of accounts) await store.erase({ issuer, subject: a.subject });
await writeFile(
  process.env.BUDDY_FIXTURE_FILE ?? '/workspace/work/buddy-account-fixture.json',
  JSON.stringify(accounts),
  { mode: 0o600 },
);
const economy = createPersistentBuddyEconomy(store.pool),
  service = new BuddyService(new FixtureAI(), new MissionEngine(), economy, economy);
const auth = Router();
auth.use(guard, requireIdentity);
const app = express();
app.use(express.json({ limit: '512kb' }));
app.post('/__buddy-fixture/reset', guard, requireIdentity, async (_req, res, next) => {
  try {
    for (const a of accounts) { const id = { issuer, subject: a.subject }; service.forget(id); await store.erase(id); }
    res.json({ reset: true, syntheticIdentity: true });
  } catch (e) { next(e); }
});
app.use(
  '/api/me',
  createIdentityRouter(guard, () => store),
);
app.use(
  '/api/motion',
  guard,
  requireIdentity,
  createMotionRouter(() => store),
);
app.use(
  '/api/buddy',
  createBuddyRouter({
    authenticate: auth,
    identity: (_req, res) => res.locals.identity,
    service,
    progress: economy,
    cosmetics: economy,
  }),
);
const error: ErrorRequestHandler = (e, _req, res, _next) => {
  res.status(e.status ?? 500).json({ error: { message: 'Fixture request rejected' } });
};
app.use(error);
const server = app.listen(8791, '127.0.0.1', () =>
  console.log('Buddy ACCOUNT TEST API on 8791: real DB/RS256; synthetic accounts and AI'),
);
process.once('SIGTERM', () => {
  void (async () => {
    service.dispose();
    for (const a of accounts) await store.erase({ issuer, subject: a.subject });
    server.close();
    await store.pool.end();
  })();
});
