import { afterAll, beforeAll, expect, it } from 'vitest';
import express, { type ErrorRequestHandler } from 'express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { Server } from 'node:http';
import { jwtGuard, requireIdentity, contributor } from './identity';

// Network discovery/JWKS regression, using a LOCAL issuer. This is not live Auth0 evidence.
let server: Server, issuer: string, privateKey: CryptoKey;
let discoveryReads = 0, jwksReads = 0;
const audience = 'https://flow-jwks-test.invalid';
const sign = (claims: Record<string, unknown> = {}, iss = issuer, aud = audience, exp: string | number = '5m') =>
  new SignJWT({ permissions: [], ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'local-network-key' })
    .setIssuer(iss).setAudience(aud).setSubject('auth0|local-network-test')
    .setIssuedAt().setExpirationTime(exp).sign(privateKey);
const call = (token?: string) => fetch(`${issuer}team`, {
  method: 'PATCH', headers: token ? { Authorization: `Bearer ${token}` } : {},
});
beforeAll(async () => {
  const keys = await generateKeyPair('RS256');
  privateKey = keys.privateKey;
  const jwk = { ...await exportJWK(keys.publicKey), kid: 'local-network-key', alg: 'RS256', use: 'sig' };
  const app = express();
  app.get('/.well-known/openid-configuration', (_req, res) => {
    discoveryReads++;
    res.json({ issuer, jwks_uri: `${issuer}.well-known/jwks.json`, id_token_signing_alg_values_supported: ['RS256'] });
  });
  app.get('/.well-known/jwks.json', (_req, res) => { jwksReads++; res.json({ keys: [jwk] }); });
  server = await new Promise<Server>(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address();
  issuer = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`;
  app.patch('/team', jwtGuard({ issuerBaseURL: issuer, audience, clockTolerance: 0 }), requireIdentity, contributor, (_req, res) => res.json({ updated: true }));
  const error: ErrorRequestHandler = (err, _req, res, _next) => res.sendStatus(err.status ?? 500);
  app.use(error);
});
afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });

it('fetches issuer discovery and JWKS before permitting a signed contributor claim', async () => {
  expect((await call(await sign({ permissions: ['update:team-presentation'] }))).status).toBe(200);
  expect(discoveryReads).toBeGreaterThan(0);
  expect(jwksReads).toBeGreaterThan(0);
});
it('enforces 401/403/200 through the network JWKS validator', async () => {
  expect((await call()).status).toBe(401);
  expect((await call(await sign())).status).toBe(403);
  expect((await call(await sign({ permissions: ['update:team-presentation'] }))).status).toBe(200);
});
it('rejects forged permissions, expired tokens and wrong issuer/audience via JWKS', async () => {
  const valid = await sign();
  const [header, , signature] = valid.split('.');
  const forged = `${header}.${Buffer.from(JSON.stringify({ iss: issuer, aud: audience, sub: 'auth0|attacker', exp: Math.floor(Date.now() / 1000) + 300, permissions: ['update:team-presentation'] })).toString('base64url')}.${signature}`;
  for (const token of [forged, await sign({}, 'https://wrong.invalid/'), await sign({}, issuer, 'wrong'), await sign({}, issuer, audience, 1)])
    expect((await call(token)).status).toBe(401);
});
