import { createHash } from 'node:crypto';
import { auth, type AuthOptions } from 'express-oauth2-jwt-bearer';
import type { RequestHandler } from 'express';
import { config } from '../config';

export type Identity = { issuer: string; subject: string };
export const ownerKey = (id: Identity) =>
  createHash('sha256')
    .update(JSON.stringify([id.issuer, id.subject]))
    .digest('hex');
export const jwtGuard = (options: AuthOptions = {}) =>
  auth({
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
