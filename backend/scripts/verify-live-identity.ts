// Run locally after Universal Login. Never paste a token into chat or command arguments.
// Reuses the production JWT guard: HTTPS issuer discovery + JWKS, RS256, exp and audience.
import express, { type ErrorRequestHandler } from 'express';
import { readPrivateToken } from './lib/privateToken';
import { jwtGuard, requireIdentity } from '../src/middleware/identity';
import { config } from '../src/config';
import { Profile, TeamPresentation } from '../../shared/src/identity';

const expected = process.env.IDENTITY_ACCEPTANCE_EXPECT ?? 'guest';
const api = new URL(process.env.IDENTITY_ACCEPTANCE_API ?? 'http://localhost:8787');
if (!['guest', 'ordinary', 'contributor'].includes(expected)) throw new Error('Invalid expected role.');
if (
  api.username || api.password || api.pathname !== '/' || api.search || api.hash ||
  !(api.protocol === 'https:' || (api.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(api.hostname)))
) throw new Error('Use the exact HTTPS API origin or a loopback development origin.');
if (config.auth0Issuer !== 'https://dev-3a2ijpzkw4p8cng6.us.auth0.com/' || config.auth0Audience !== 'https://api.vlaiqflow.app')
  throw new Error('This acceptance probe requires the configured FLOW Auth0 tenant and audience.');
if (config.teamContributors.length) throw new Error('Disable fallback grants for native Auth0 acceptance.');
const request = (path: string, token?: string, method = 'GET', body?: unknown) => fetch(new URL(path, api), {
  method,
  redirect: 'error',
  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
  signal: AbortSignal.timeout(15000),
});
const requireStatus = (response: Response, status: number, label: string) => {
  if (response.status !== status) throw new Error(`${label}: expected HTTP ${status}, got ${response.status}.`);
};

async function main() {
  // A valid-shaped body ensures rejection is authentication, not JSON validation.
  const publicTeam = await request('/api/team');
  requireStatus(publicTeam, 200, 'Public team read');
  const team = TeamPresentation.parse(await publicTeam.json());
  requireStatus(await request('/api/team', undefined, 'PATCH', team), 401, 'Missing token team PATCH');
  for (const path of ['/api/me', '/api/motion/wallet', '/api/flow-voice/session'])
    requireStatus(await request(path, undefined, path.endsWith('/session') ? 'POST' : 'GET'), 401, 'Missing token private API');
  if (expected === 'guest') {
    console.log('PASS: real running API rejects missing tokens with 401. No Auth0 authentication claimed.');
    return;
  }
  if (process.env.IDENTITY_ACCEPTANCE_TOKEN_FILE || process.argv.length > 2)
    throw new Error('Use hidden local terminal entry; token files and arguments are refused.');
  let token = await readPrivateToken();
  const validator = express();
  validator.get('/', jwtGuard(), requireIdentity, (req, res) => res.json({
    validated: true,
    nativeContributor: Array.isArray(req.auth?.payload.permissions) && req.auth.payload.permissions.includes('update:team-presentation'),
  }));
  const errors: ErrorRequestHandler = (_err, _req, res, _next) => res.status(401).json({ validated: false });
  validator.use(errors);
  const server = validator.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Validator did not start.');
    const validation = await fetch(`http://127.0.0.1:${address.port}/`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
    });
    requireStatus(validation, 200, 'Actual Auth0 issuer/JWKS validation');
    const result = await validation.json();
    if (result.nativeContributor !== (expected === 'contributor')) throw new Error('Verified Auth0 permission differs from expected role.');
    const profile = await request('/api/me', token);
    requireStatus(profile, 200, 'Real account profile');
    Profile.parse(await profile.json()); // Deliberately do not print personal fields.
    const access = await request('/api/team/access', token);
    requireStatus(access, expected === 'contributor' ? 200 : 403, 'Contributor access');
    if (expected === 'contributor' && (await access.json()).source !== 'auth0-permissions')
      throw new Error('Expected native Auth0 permissions, not an application grant.');
    // Re-save the exact public presentation: exercises the write without changing jury content.
    requireStatus(await request('/api/team', token, 'PATCH', team), expected === 'contributor' ? 200 : 403, 'Team PATCH');
    console.log(`PASS: real Auth0 RS256 issuer/JWKS/audience/expiry validation; profile 200; ${expected} team PATCH ${expected === 'contributor' ? 200 : 403}. No tokens or personal fields logged.`);
  } finally {
    token = '';
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
main().catch((error) => {
  // Never print upstream bodies, the token, claims, connection strings or request headers.
  console.error(error instanceof Error && /^(Public team|Missing token|Use |Token entry|Terminal input|Invalid or oversized|Expected |Actual Auth0|Verified Auth0|Real account|Contributor access|Team PATCH|Validator)/.test(error.message)
    ? error.message : 'Acceptance failed. Check connectivity, migration and a fresh Auth0 access token locally.');
  process.exitCode = 1;
});
