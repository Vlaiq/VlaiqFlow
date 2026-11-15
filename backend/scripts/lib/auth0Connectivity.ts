import { get } from 'node:https';

export const FLOW_ISSUER = 'https://dev-3a2ijpzkw4p8cng6.us.auth0.com/';
export const FLOW_JWKS = FLOW_ISSUER + '.well-known/jwks.json';
export function checkDiscovery(value: unknown) {
  const d = value as Record<string, unknown> | null;
  if (d?.issuer !== FLOW_ISSUER || d.jwks_uri !== FLOW_JWKS ||
      !Array.isArray(d.id_token_signing_alg_values_supported) || !d.id_token_signing_alg_values_supported.includes('RS256'))
    throw new Error('OIDC metadata does not match the expected issuer/JWKS/RS256 configuration.');
}
export function checkJwks(value: unknown) {
  const keys = (value as { keys?: Record<string, unknown>[] } | null)?.keys;
  if (!Array.isArray(keys) || !keys.some(k => k.kty === 'RSA' && k.alg === 'RS256' &&
      (k.use === undefined || k.use === 'sig') && typeof k.kid === 'string' && k.kid.length > 0 &&
      typeof k.n === 'string' && /^[A-Za-z0-9_-]+$/.test(k.n) && typeof k.e === 'string' && /^[A-Za-z0-9_-]+$/.test(k.e)))
    throw new Error('JWKS does not contain an expected RSA/RS256 signing key.');
}
/** Same Node HTTPS transport family used by the JWT middleware; default trust stays enabled. */
export function httpsJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = get(url, { rejectUnauthorized: true, timeout: 10000 }, response => {
      if (response.statusCode !== 200) {
        response.resume(); reject(new Error(`HTTPS endpoint returned HTTP ${response.statusCode ?? 0}.`)); return;
      }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 256000) request.destroy(new Error('HTTPS response exceeded the metadata size limit.'));
        else chunks.push(chunk);
      });
      response.once('error', reject);
      response.once('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new Error('HTTPS endpoint did not return valid JSON.')); }
      });
    });
    request.once('timeout', () => request.destroy(Object.assign(new Error('HTTPS connection timed out.'), { code: 'ETIMEDOUT' })));
    request.once('error', reject);
  });
}
export function safeNetworkError(error: unknown) {
  const e = error as { message?: string; code?: string; cause?: { code?: string } };
  if (e.message && /^(HTTPS (endpoint|response|connection)|OIDC metadata|JWKS does not)/.test(e.message)) return e.message;
  const code = e.cause?.code ?? e.code;
  return code && /^[A-Z0-9_]{1,60}$/.test(code) ? code : 'CONNECTION_FAILED';
}
