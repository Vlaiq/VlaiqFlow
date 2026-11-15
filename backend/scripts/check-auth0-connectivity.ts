import { lookup } from 'node:dns/promises';
import { FLOW_ISSUER, FLOW_JWKS, checkDiscovery, checkJwks, httpsJson, safeNetworkError } from './lib/auth0Connectivity';

async function main() {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('Remove NODE_TLS_REJECT_UNAUTHORIZED=0 before testing.');
  console.log(`Node ${process.versions.node}: TLS validation enabled; no credentials used.`);
  console.log(`Proxy env present: ${!!(process.env.HTTPS_PROXY || process.env.https_proxy)}; Node env-proxy enabled: ${process.env.NODE_USE_ENV_PROXY === '1'}. Proxy values are hidden.`);
  try {
    await lookup(new URL(FLOW_ISSUER).hostname);
    console.log('DNS: resolved (addresses omitted).');
  } catch (error) {
    console.log(`DNS: ${safeNetworkError(error)}. A configured proxy may resolve the host remotely.`);
  }
  let failed = false;
  for (const transport of ['Node fetch', 'Node HTTPS/JWT transport']) {
    const read = transport === 'Node fetch' ? async (url: string) => {
        const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
        if (r.status !== 200) { await r.body?.cancel(); throw new Error(`HTTPS endpoint returned HTTP ${r.status}.`); }
        const text = await r.text();
        if (text.length > 256000) throw new Error('HTTPS response exceeded the metadata size limit.');
        try { return JSON.parse(text); } catch { throw new Error('HTTPS endpoint did not return valid JSON.'); }
    } : httpsJson;
    for (const [label, url, validate] of [
      ['discovery', FLOW_ISSUER + '.well-known/openid-configuration', checkDiscovery],
      ['JWKS', FLOW_JWKS, checkJwks],
    ] as const) {
      try {
        validate(await read(url));
        console.log(`PASS: ${transport}: ${label} HTTPS 200 and expected metadata.`);
      } catch (error) {
        failed = true;
        console.error(`BLOCKED: ${transport}: ${label}: ${safeNetworkError(error)}. Check DNS, authorized proxy, trusted CA and firewall; do not disable TLS.`);
      }
    }
  }
  console.log('Browser check remains separate: open the discovery and JWKS URLs in your own Windows browser. This preflight does not authenticate a user or validate a JWT.');
  process.exitCode = failed ? 1 : 0;
}
main().catch(() => { console.error('Connectivity check refused insecure TLS configuration.'); process.exitCode = 1; });
