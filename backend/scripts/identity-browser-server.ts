// Disposable local integration fixture. Not imported by production. Real route handlers + PostgreSQL.
import express, { type ErrorRequestHandler } from 'express';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import { writeFile } from 'node:fs/promises';
import { jwtGuard, requireIdentity } from '../src/middleware/identity';
import { IdentityStore } from '../src/services/identityStore';
import { createIdentityRouter, createTeamRouter } from '../src/routes/identity';
import { createMotionRouter } from '../src/routes/motion';
const url = process.env.IDENTITY_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('An explicitly disposable _test database is required.');
const store = new IdentityStore(url);
await store.migrate();
const issuer = 'https://browser-test.invalid/',
  audience = 'https://browser-api-test.invalid';
const keys = await generateKeyPair('RS256');
const guard = jwtGuard({
  issuerBaseURL: undefined,
  issuer,
  audience,
  publicKey: await exportSPKI(keys.publicKey),
});
const accounts = await Promise.all(
  ['a', 'b', 'contributor'].map(async (suffix) => ({
    subject: `auth0|browser-fixture-${suffix}`,
    token: await new SignJWT({
      permissions: suffix === 'contributor' ? ['update:team-presentation'] : [],
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(`auth0|browser-fixture-${suffix}`)
      .setExpirationTime('1h')
      .sign(keys.privateKey),
  })),
);
for (const a of accounts) await store.erase({ issuer, subject: a.subject });
await writeFile(
  process.env.IDENTITY_FIXTURE_FILE ?? '/tmp/flow-identity-browser-fixture.json',
  JSON.stringify(accounts),
  { mode: 0o600 },
);
const app = express();
app.use(express.json({ limit: '512kb' }));
app.use(
  '/api/me',
  createIdentityRouter(guard, () => store),
);
app.use(
  '/api/team',
  createTeamRouter(guard, () => store),
);
app.use(
  '/api/motion',
  guard,
  requireIdentity,
  createMotionRouter(() => store),
);
const errors: ErrorRequestHandler = (e, _req, res, _next) =>
  res.status(e.status ?? 500).json({
    error: {
      message: e.status === 400 ? 'Imagine invalidă.' : 'Cererea nu poate fi procesată.',
    },
  });
app.use(errors);
const server = app.listen(8790, '127.0.0.1', () =>
  console.log('Disposable identity browser API listening on 8790'),
);
process.once('SIGTERM', () => {
  void (async () => {
    for (const a of accounts) await store.erase({ issuer, subject: a.subject });
    server.close();
    await store.pool.end();
    process.exit(0);
  })();
});
