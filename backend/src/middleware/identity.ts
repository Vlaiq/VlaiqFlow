import { createHash } from 'node:crypto';
import { auth, type AuthOptions } from 'express-oauth2-jwt-bearer';
import type { RequestHandler } from 'express';
import { config } from '../config';

export type Identity = { issuer: string; subject: string };
export const ownerKey = (id: Identity) =>
  createHash('sha256')
    .update(JSON.stringify([id.issuer, id.subject]))
    .digest('hex');
/** Issuer of the no-sign-in identities: one random ID per browser (FLOW_ACCOUNTS=local). */
export const DEVICE_ISSUER = 'urn:vlaiq-flow:device';
const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/**
 * Without sign-in, the browser sends `X-Flow-Device: <random UUID v4>` (kept in its localStorage).
 * A custom header is never sent cross-site without a CORS preflight, so it is not CSRF-able like a
 * cookie. Anyone holding the ID acts as that device: it is a prototype convenience, not an account.
 */
export const deviceGuard: RequestHandler = (req, res, next) => {
  const id = req.get('X-Flow-Device')?.trim().toLowerCase();
  if (!id || !DEVICE_ID.test(id)) {
    res.status(401).json({ error: { message: 'Lipsește identificatorul acestui dispozitiv. Reîncarcă pagina.' } });
    return;
  }
  // Same shape as a verified JWT, so requireIdentity and every store keep working unchanged.
  (req as unknown as { auth: unknown }).auth = {
    payload: { iss: DEVICE_ISSUER, sub: `device|${id}` },
    header: { alg: 'none' },
    token: '',
  };
  next();
};
/**
 * The identity guard for private routes. With explicit options (tests) it is always the Auth0 JWT
 * check; otherwise FLOW_ACCOUNTS chooses: `local` (default, no sign-in) or `auth0`.
 */
export const jwtGuard = (options?: AuthOptions): RequestHandler =>
  !options && config.accounts === 'local'
    ? deviceGuard
    : auth({
        issuerBaseURL: config.auth0Issuer,
        audience: config.auth0Audience,
        tokenSigningAlg: 'RS256',
        ...options,
      });
export const requireIdentity: RequestHandler = (req, res, next) => {
  const p = req.auth?.payload;
  // Client-credentials tokens aren't consumer accounts.
  if (
    typeof p?.iss !== 'string' ||
    typeof p.sub !== 'string' ||
    !p.sub ||
    p.sub.endsWith('@clients')
  ) {
    res.status(401).json({ error: { message: 'Conectează-te pentru a continua.' } });
    return;
  }
  res.locals.identity = { issuer: p.iss, subject: p.sub } satisfies Identity;
  res.setHeader('Cache-Control', 'no-store');
  next();
};
export const contributor: RequestHandler = (req, res, next) => {
  const source = contributorSource(req.auth?.payload ?? {});
  if (!source) {
    res.status(403).json({
      error: { message: 'Este necesară permisiunea de contributor VLAIQ.' },
    });
    return;
  }
  res.locals.authorizationSource = source;
  next();
};

/** Only evaluate verified claims after JWT validation; never label backend grants as native RBAC. */
export function contributorSource(
  claims: Record<string, unknown>,
  grants: readonly Identity[] = config.teamContributors,
) {
  if (Array.isArray(claims.permissions) && claims.permissions.includes('update:team-presentation'))
    return 'auth0-permissions' as const;
  if (grants.some((id) => id.issuer === claims.iss && id.subject === claims.sub))
    return 'application-managed' as const;
  return null;
}
