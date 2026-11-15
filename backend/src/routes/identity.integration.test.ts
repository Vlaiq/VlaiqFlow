import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express, { type ErrorRequestHandler } from 'express';
import { generateKeyPair, SignJWT, exportSPKI } from 'jose';
import sharp from 'sharp';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { jwtGuard, requireIdentity } from '../middleware/identity';
import { IdentityStore } from '../services/identityStore';
import { createIdentityRouter, createTeamRouter, processAvatar } from './identity';
import { createMotionRouter } from './motion';
import { DEFAULT_TEAM } from '../../../shared/src/identity';
const url = process.env.IDENTITY_TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith('_test'))
  throw new Error('Identity tests require an explicitly disposable _test database.');
describe.skipIf(!url)('FLOW Identity: real PostgreSQL + RS256 middleware integration', () => {
  let server: Server, base: string, store: IdentityStore, privateKey: CryptoKey;
  const issuer = 'https://identity-test.invalid/',
    audience = 'https://flow-test.invalid';
  const a = { issuer, subject: `auth0|test-a-${randomUUID()}` },
    b = { issuer, subject: `google-oauth2|test-b-${randomUUID()}` };
  const profile = {
    displayName: 'Alex Test',
    nickname: 'Alex',
    biography: '<script>not HTML</script>',
    voiceConsent: true,
    preferences: { mode: 'cheap', maxWalkMinutes: 8, schoolZone: true },
  };
  const sign = async (subject = a.subject, claims: Record<string, unknown> = {}) =>
    new SignJWT({ permissions: [], ...claims })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime(typeof claims.exp === 'number' ? claims.exp : '5m')
      .sign(privateKey);
  const call = async (
    path: string,
    token?: string,
    method = 'GET',
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body
        ? Buffer.isBuffer(body)
          ? new Uint8Array(body)
          : JSON.stringify(body)
        : undefined,
    });
  beforeAll(async () => {
    const keys = await generateKeyPair('RS256');
    privateKey = keys.privateKey;
    const guard = jwtGuard({
      issuerBaseURL: undefined,
      issuer,
      audience,
      publicKey: await exportSPKI(keys.publicKey),
      clockTolerance: 0,
    });
    store = new IdentityStore(url!);
    await store.migrate();
    const app = express();
    app.use(express.json());
    app.use(
      '/me',
      createIdentityRouter(guard, () => store),
    );
    app.use(
      '/team',
      createTeamRouter(guard, () => store),
    );
    app.use(
      '/motion',
      guard,
      requireIdentity,
      createMotionRouter(() => store),
    );
    const errors: ErrorRequestHandler = (e, _req, res, _next) => {
      res.status(e.status ?? 500).json({ error: { message: 'Request rejected' } });
    };
    app.use(errors);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
    if (store) {
      await store.erase(a);
      await store.erase(b);
      await store.pool.query('DELETE FROM flow_team');
      await store.pool.end();
    }
  });
  it('rejects missing, invalid, expired, wrong issuer/audience/signature and machine tokens', async () => {
    expect((await call('/me')).status).toBe(401);
    expect((await call('/me', 'invalid')).status).toBe(401);
    const tokens = [
      await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer('https://wrong.invalid/')
        .setAudience(audience)
        .setSubject(a.subject)
        .setExpirationTime('5m')
        .sign(privateKey),
      await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(issuer)
        .setAudience('wrong')
        .setSubject(a.subject)
        .setExpirationTime('5m')
        .sign(privateKey),
      await sign(a.subject, { exp: 1 }),
      await sign('service@clients'),
    ];
    for (const t of tokens) expect((await call('/me', t)).status).toBe(401);
    const token = await sign();
    expect((await call('/me', token.slice(0, -10) + 'abcdefghij')).status).toBe(401);
  });
  it('persists profile across independent database connections; rejects user IDs and privilege fields', async () => {
    const t = await sign();
    const r = await call('/me', t, 'PATCH', profile);
    expect(r.status).toBe(200);
    expect((await r.json()).nickname).toBe('Alex');
    const otherConnection = new IdentityStore(url!);
    expect((await otherConnection.profile(a)).biography).toBe(profile.biography);
    await otherConnection.pool.end();
    for (const extra of [
      { subject: b.subject },
      { coins: 9999 },
      { role: 'admin' },
      { nickname: 'x'.repeat(31) },
    ])
      expect((await call('/me', t, 'PATCH', { ...profile, ...extra })).status).toBe(400);
    const other = await call('/me', await sign(b.subject));
    expect((await other.json()).nickname).not.toBe('Alex');
    expect((await call('/me/' + b.subject, t)).status).toBe(404);
  });
  it('requires server-side contributor permission with real 401/403/200 outcomes', async () => {
    expect((await call('/team', undefined, 'PATCH', DEFAULT_TEAM)).status).toBe(401);
    expect((await call('/team', await sign(), 'PATCH', DEFAULT_TEAM)).status).toBe(403);
    expect(
      (
        await call(
          '/team',
          await sign(a.subject, {
            permissions: ['update:team-presentation'],
          }),
          'PATCH',
          DEFAULT_TEAM,
        )
      ).status,
    ).toBe(200);
  });
  it('validates, re-encodes, persists and isolates avatars; removes original metadata', async () => {
    const image = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#167d50' },
    })
      .withMetadata({ exif: { IFD0: { Artist: 'Private artist' } } })
      .jpeg()
      .toBuffer();
    const t = await sign();
    expect(
      (
        await call('/me/avatar', t, 'PUT', image, {
          'Content-Type': 'image/jpeg',
        })
      ).status,
    ).toBe(200);
    const r = await call('/me/avatar', t);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('content-type')).toContain('image/webp');
    const bytes = Buffer.from(await r.arrayBuffer()),
      meta = await sharp(bytes).metadata();
    expect(meta.width).toBe(512);
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe('webp');
    const otherConnection = new IdentityStore(url!);
    expect(await otherConnection.avatar(a)).toEqual(bytes);
    await otherConnection.pool.end();
    expect((await call('/me/avatar', await sign(b.subject))).status).toBe(404);
    expect(
      (
        await call('/me/avatar', t, 'PUT', Buffer.from('<svg><script/></svg>'), {
          'Content-Type': 'image/png',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('/me/avatar', t, 'PUT', Buffer.from('not an image'), {
          'Content-Type': 'image/jpeg',
        })
      ).status,
    ).toBe(400);
    expect((await call('/me/avatar', t, 'DELETE')).status).toBe(200);
    expect((await call('/me/avatar', t)).status).toBe(404);
  });
  it('rejects oversized uploads and unsupported executable payloads', async () => {
    await expect(processAvatar(Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow('5 MB');
    await expect(processAvatar(Buffer.from('GIF89a'))).rejects.toThrow('validă');
  });
  it('locks concurrent rewards, prevents duplicate credit and isolates wallets across accounts', async () => {
    const start = Date.now() - 150000;
    const session = await store.motion(a, (s, o) => s.start(o, 'walk', start));
    const points = Array.from({ length: 25 }, (_, i) => ({
      lat: 45.75 + ((220 / 111195) * i) / 24,
      lng: 21.22,
      accuracy: 4,
      timestamp: start + (120000 * i) / 24,
      segment: 0,
    }));
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => call('/motion/finish', undefined, 'POST')),
    );
    expect(responses.every((r) => r.status === 401)).toBe(true);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => store.motion(a, (s, o) => s.finish(o, session.id, points))),
    );
    expect(results.every((r) => r.wallet.balance === 10)).toBe(true);
    expect(results[0]!.wallet.transactions).toHaveLength(1);
    const wallet = await call('/motion/wallet', await sign());
    expect((await wallet.json()).balance).toBe(10);
    const other = await call('/motion/wallet', await sign(b.subject));
    expect((await other.json()).balance).toBe(0);
    expect(
      (
        await call('/motion/finish', await sign(b.subject), 'POST', {
          id: session.id,
          points,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call('/motion/finish', await sign(), 'POST', {
          id: session.id,
          points,
          coins: 500,
        })
      ).status,
    ).toBe(400);
    const raw = await store.pool.query(
      'SELECT wallet FROM flow_accounts WHERE issuer=$1 AND subject=$2',
      [issuer, a.subject],
    );
    expect(JSON.stringify(raw.rows)).not.toContain('"lat"');
    const history = await call('/motion/activities', await sign());
    expect((await history.json())[0].evaluation.status).toBe('eligible');
  });
  it('erases only owned FLOW data, leaving Auth0 identity and other accounts explicit', async () => {
    expect((await call('/me', await sign(), 'DELETE', {})).status).toBe(400);
    const r = await call('/me', await sign(), 'DELETE', {
      confirm: 'DELETE',
    });
    expect(await r.json()).toEqual({
      erased: true,
      auth0IdentityDeleted: false,
    });
    const result = await store.pool.query(
      'SELECT subject FROM flow_accounts WHERE issuer=$1 AND subject=$2',
      [issuer, a.subject],
    );
    expect(result.rowCount).toBe(0);
    expect((await store.profile(b)).nickname).toBe('Călător');
  });
});
