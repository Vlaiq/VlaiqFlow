// TEST ONLY: local signed RS256 identities and deterministic providers. Never imported by production.
import express, { type ErrorRequestHandler } from 'express';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import { CompleteJourneyRequest, CompleteJourneyResponse } from '@vlaiq/shared';
import { jwtGuard } from '../src/middleware/identity';
import {
  JourneyHandoffs,
  journeyHandoffs,
} from '../src/services/journeyHandoffs';
import {
  createJourneyBuddyRouter,
  narrateJourney,
} from '../src/routes/journeyBuddy';
import { journeyRouter } from '../src/routes/journeys';
import { parkingsRouter } from '../src/routes/parkings';
import { destinationsRouter } from '../src/routes/destinations';
import { cityRouter } from '../src/routes/city';
import { healthRouter } from '../src/routes/health';
import { recommendations } from '../../shared/test-fixtures/completeJourney';
if (process.env.NODE_ENV !== 'test' || process.env.NETROM_FIXTURES !== '1')
  throw new Error('Explicit test mode required');
const { completeFixture } = createRequire(import.meta.url)(
  '../../scripts/lib/smart-journey-fixture.cjs',
);
const keys = await generateKeyPair('RS256'),
  issuer = 'https://netrom-browser.test.invalid/',
  audience = 'https://netrom-api.test.invalid';
const accounts = await Promise.all(
  ['alice', 'bob'].map(async (name) => ({
    subject: `auth0|netrom-${name}`,
    token: await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(`auth0|netrom-${name}`)
      .setExpirationTime('1h')
      .sign(keys.privateKey),
  })),
);
const fixtureFile = process.env.NETROM_FIXTURE_FILE ?? '/workspace/work/netrom-accounts.json';
await mkdir(dirname(fixtureFile), { recursive: true });
await writeFile(
  fixtureFile,
  JSON.stringify(accounts),
  { mode: 0o600 },
);
const guard = jwtGuard({
  issuerBaseURL: undefined,
  issuer,
  audience,
  publicKey: await exportSPKI(keys.publicKey),
});
let offset = 0,
  outage = false,
  walkOnly = false;
const store = new JourneyHandoffs(() => Date.now() + offset);
const live = process.env.NETROM_REAL_PROVIDERS === '1';
const app = express();
app.use(express.json());
app.post('/__netrom-fixture', (req, res) => {
  offset = req.body.expired ? 20 * 60_000 : 0;
  outage = !!req.body.outage;
  walkOnly = !!req.body.walkOnly;
  res.json({ synthetic: true });
});
app.use('/api/parkings', parkingsRouter);
app.use('/api/destinations', destinationsRouter);
app.use('/api/city', cityRouter);
app.use('/api/health', healthRouter);
// The live smoke keeps provider-backed complete journeys; list fixtures are not part of that assertion.
app.post('/api/recommendations', (_req, res) => res.json(recommendations()));
if (live) app.use('/api/journeys', journeyRouter);
app.post('/api/journeys/complete', (req, res) => {
  const input = CompleteJourneyRequest.parse(req.body),
    value = CompleteJourneyResponse.parse(completeFixture(input));
  if (walkOnly) {
    value.journeys = value.journeys.filter((j) => j.category === 'walk');
    value.opportunity = null;
    for (const r of Object.values(value.rankings)) {
      r.ids = ['fixture-walk'];
      r.recommendedId = 'fixture-walk';
    }
  }
  const session = req.get('X-Flow-Journey-Session');
  res.setHeader('Cache-Control', 'no-store');
  res.json(session ? store.publish(session, input, value) : value);
});
app.use(
  '/api/journey-buddy',
  live
    ? createJourneyBuddyRouter(guard, journeyHandoffs, narrateJourney)
    : createJourneyBuddyRouter(guard, store, async () => {
        if (outage) throw new Error('SYNTHETIC OUTAGE');
        return 'Opțiunea selectată respectă limita de mers pe jos. Duratele sunt estimate; disponibilitatea live este necunoscută.';
      }),
);
app.get('/api/me', guard, (_req, res) =>
  res.json({
    displayName: 'Cont sintetic de test',
    nickname: 'NetRom',
    biography: '',
    voiceConsent: false,
    preferences: { mode: 'balanced', maxWalkMinutes: 12, schoolZone: true },
    avatarVersion: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
);
app.get('/api/motion/wallet', guard, (_req, res) =>
  res.json({ balance: 0, transactions: [] }),
);
const error: ErrorRequestHandler = (e, _req, res, _next) => {
  res.status(e.status ?? 500).json({ error: { message: e.message } });
};
app.use(error);
const port = live ? 8793 : 8792;
app.listen(port, '127.0.0.1', () =>
  console.log(
    `NETROM TEST API ${port}: synthetic SDK/accounts; ${live ? 'REAL HeiGIT/Timpark/OSM/Gemini' : 'synthetic providers'}; real RS256/handlers/MapLibre`,
  ),
);
