import { expect, it } from 'vitest';
import { FLOW_ISSUER, FLOW_JWKS, checkDiscovery, checkJwks, safeNetworkError } from './auth0Connectivity';
it('requires the exact issuer, same-tenant JWKS and RS256 metadata', () => {
  const d = { issuer: FLOW_ISSUER, jwks_uri: FLOW_JWKS, id_token_signing_alg_values_supported: ['RS256'] };
  expect(() => checkDiscovery(d)).not.toThrow();
  for (const change of [{ issuer: 'https://other.invalid/' }, { jwks_uri: 'http://localhost/keys' }, { id_token_signing_alg_values_supported: ['HS256'] }])
    expect(() => checkDiscovery({ ...d, ...change })).toThrow();
});
it('requires actual public RSA key material and a signing key identifier', () => {
  const key = { kty: 'RSA', alg: 'RS256', use: 'sig', kid: 'test', n: 'base64url', e: 'AQAB' };
  expect(() => checkJwks({ keys: [key] })).not.toThrow();
  for (const change of [{ n: '' }, { kid: '' }, { alg: 'HS256' }, { use: 'enc' }, { kty: 'oct' }])
    expect(() => checkJwks({ keys: [{ ...key, ...change }] })).toThrow();
});
it('reports transport status/codes without exposing a proxy URL or payload', () => {
  expect(safeNetworkError(new Error('https://user:private@proxy.invalid'))).toBe('CONNECTION_FAILED');
  expect(safeNetworkError({ cause: { code: 'CERT_HAS_EXPIRED' } })).toBe('CERT_HAS_EXPIRED');
  expect(safeNetworkError(new Error('HTTPS endpoint returned HTTP 403.'))).toContain('403');
});
