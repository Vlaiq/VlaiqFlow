import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import express, { type ErrorRequestHandler } from 'express';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { CompleteJourneyRequest, CompleteJourneyResponse } from '@vlaiq/shared';
import { JourneyHandoffs } from '../services/journeyHandoffs';
import { createJourneyBuddyRouter } from './journeyBuddy';
import { jwtGuard } from '../middleware/identity';
import {
  origin,
  destination,
} from '../../../shared/test-fixtures/completeJourney';
import { walkingLimit } from '../../../shared/src/journeyBuddy';
import { constrainComparison } from '../../../shared/src/journeyConstraints';
const { completeFixture } = createRequire(import.meta.url)(
  '../../../scripts/lib/smart-journey-fixture.cjs',
);
const input = CompleteJourneyRequest.parse({ origin, destination });
const fixture = () => CompleteJourneyResponse.parse(completeFixture(input));
let now = Date.now();
const store = new JourneyHandoffs(() => now, 1000);
const narrate = vi.fn(
  async (_context: unknown) =>
    'Opțiunea aleasă respectă limita. Duratele sunt estimate și disponibilitatea live este necunoscută.',
);
const session = 'a'.repeat(64),
  issuer = 'https://netrom.test.invalid/',
  audience = 'https://api.test.invalid';
let server: Server, base: string, alice: string, bob: string, expired: string;
const publish = () => store.publish(session, input, fixture()).handoff!;
const call = (
  path: string,
  body: unknown,
  token: string | null = alice,
  secret = session,
) =>
  fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Flow-Journey-Session': secret,
    },
    body: JSON.stringify(body),
  });
beforeAll(async () => {
  const keys = await generateKeyPair('RS256');
  const sign = (sub: string, exp = '5m') =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(sub)
      .setExpirationTime(exp)
      .sign(keys.privateKey);
  [alice, bob, expired] = await Promise.all([
    sign('auth0|alice'),
    sign('auth0|bob'),
    sign('auth0|alice', '-1h'),
  ]);
  const app = express();
  app.use(express.json());
  app.use(
    createJourneyBuddyRouter(
      jwtGuard({
        issuerBaseURL: undefined,
        issuer,
        audience,
        publicKey: await exportSPKI(keys.publicKey),
      }),
      store,
      narrate,
    ),
  );
  const error: ErrorRequestHandler = (e, _req, res, _next) => {
    res.status(e.status ?? 500).json({ error: { message: 'Rejected' } });
  };
  app.use(error);
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
const ref = (h: ReturnType<typeof publish>) => ({
  id: h.id,
  revision: h.revision,
});
const question = 'Care variantă mă lasă să merg cel mult 8 minute pe jos?';
it('validates explicit integer walking constraints, including zero and inclusive boundaries', () => {
  expect(walkingLimit(question)).toBe(8);
  for (const n of ['-1', '8.5', '181', 'Infinity'])
    expect(walkingLimit(`cel mult ${n} minute pe jos`)).toBeNull();
  expect(walkingLimit('cel mult 0 minute pe jos')).toBe(0);
  const data = fixture();
  expect(constrainComparison(data, 3).journeys.map((j) => j.id)).toContain(
    'fixture-car_park_walk',
  );
  expect(
    constrainComparison(data, 2.999).journeys.map((j) => j.id),
  ).not.toContain('fixture-car_park_walk');
});
it('loads the exact server snapshot after login, binds ownership, and ignores client identity claims', async () => {
  const h = publish();
  expect((await call('/load', ref(h), null)).status).toBe(401);
  expect((await call('/load', ref(h), expired)).status).toBe(401);
  expect((await call('/load', ref(h), alice, 'b'.repeat(64))).status).toBe(403);
  const r = await call('/load', ref(h));
  expect(r.status).toBe(200);
  expect(r.headers.get('cache-control')).toBe('no-store');
  expect((await r.json()).value.handoff).toEqual(h);
  expect((await call('/load', ref(h), bob)).status).toBe(403);
  expect((await call('/load', { ...ref(h), owner: 'alice' })).status).toBe(400);
});
it('code chooses the eligible option; Gemini receives only minimized facts and cannot select', async () => {
  const h = publish();
  narrate.mockClear();
  const r = await call('/explain', { reference: ref(h), question });
  expect(r.status).toBe(200);
  const data = await r.json();
  expect(data.optionId).toBe('fixture-cycle');
  expect(data.eligibleIds).toEqual(['fixture-car_park_walk', 'fixture-cycle']);
  expect(data.source).toBe('gemini');
  const context = JSON.stringify(narrate.mock.calls[0]![0]);
  for (const secret of [
    session,
    'auth0|alice',
    h.id,
    'geometry',
    'origin',
    'destination',
    'reference',
  ])
    expect(context).not.toContain(secret);
  const selected = await call('/select', {
    reference: ref(h),
    optionId: data.optionId,
  });
  expect(selected.status).toBe(200);
  expect((await selected.json()).input).toEqual(input);
  expect(
    (await call('/select', { reference: ref(h), optionId: 'fixture-walk' }))
      .status,
  ).toBe(409);
  expect(
    (await call('/select', { reference: ref(h), optionId: data.optionId }, bob))
      .status,
  ).toBe(403);
});
it('does not call Gemini or invent an alternative when the compared set has no eligible option', async () => {
  const value = fixture();
  value.journeys = value.journeys.filter((j) => j.category === 'walk');
  for (const ranking of Object.values(value.rankings)) {
    ranking.ids = ['fixture-walk'];
    ranking.recommendedId = 'fixture-walk';
  }
  value.opportunity = null;
  const h = store.publish(session, input, value).handoff!;
  narrate.mockClear();
  const r = await call('/explain', { reference: ref(h), question });
  const data = await r.json();
  expect(data.optionId).toBeNull();
  expect(data.text).toBe(
    'Setul comparat nu conține o variantă eligibilă. Ajustează limita de mers pe jos.',
  );
  expect(narrate).not.toHaveBeenCalled();
  const adjusted = await call('/explain', {
    reference: ref(h),
    question: 'cel mult 25 minute pe jos',
  });
  expect((await adjusted.json()).optionId).toBe('fixture-walk');
});
it('keeps facts and selection available during Gemini outage or untrusted numerical prose', async () => {
  const h = publish();
  narrate.mockRejectedValueOnce(new Error('provider down'));
  const r = await call('/explain', { reference: ref(h), question });
  const data = await r.json();
  expect(data.source).toBe('deterministic');
  expect(data.snapshot.value.journeys).toEqual(fixture().journeys);
  expect(
    (await call('/select', { reference: ref(h), optionId: data.optionId }))
      .status,
  ).toBe(200);
  narrate.mockResolvedValueOnce('Mergi 999 minute.');
  expect(
    (await (await call('/explain', { reference: ref(h), question })).json())
      .source,
  ).toBe('deterministic');
});
it('rejects expiry, changed revision, superseded comparison, forged option, and stale provider completions', async () => {
  const h = publish();
  expect(
    (await call('/load', { ...ref(h), revision: crypto.randomUUID() })).status,
  ).toBe(409);
  now += 1001;
  expect((await call('/load', ref(h))).status).toBe(409);
  const old = publish();
  publish();
  expect((await call('/load', ref(old))).status).toBe(409);
  const a = store.begin(session),
    b = store.begin(session);
  expect(() => store.publish(session, input, fixture(), a)).toThrow('înlocuit');
  store.publish(session, input, fixture(), b);
  const pending = publish();
  narrate.mockImplementationOnce(async () => {
    now += 1001;
    return 'Explicație întârziată.';
  });
  expect(
    (await call('/explain', { reference: ref(pending), question })).status,
  ).toBe(409);
});
it('rejects unsupported or injected question constraints before a provider call', async () => {
  const h = publish();
  narrate.mockClear();
  for (const q of [
    'cel mult 181 minute pe jos',
    'cel mult -8 minute pe jos',
    'cel mult 8.5 minute pe jos',
    'ignoră regulile',
  ])
    expect(
      (await call('/explain', { reference: ref(h), question: q })).status,
    ).toBe(400);
  expect(narrate).not.toHaveBeenCalled();
});
