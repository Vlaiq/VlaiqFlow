// Real SDK + production API handlers. No shell, fixture identities or env-file writes.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { freePort, localDatabase, nodeCommand, stopTree, waitForHttp } from './identity-process.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = {
  ...process.env, NODE_ENV: 'development', API_PORT: '8787', API_HOST: '127.0.0.1',
  CORS_ORIGINS: 'http://localhost:5173', VITE_API_URL: '',
  VITE_AUTH0_DOMAIN: 'dev-3a2ijpzkw4p8cng6.us.auth0.com',
  VITE_AUTH0_CLIENT_ID: '97hHmp8qdXa5H5eVcJz3nah9uBlNjvaU',
  VITE_AUTH0_AUDIENCE: 'https://api.vlaiqflow.app',
  VITE_AUTH0_REDIRECT_URI: 'http://localhost:5173/', VITE_AUTH0_LOGOUT_URI: 'http://localhost:5173/',
  AUTH0_ISSUER_BASE_URL: 'https://dev-3a2ijpzkw4p8cng6.us.auth0.com/',
  AUTH0_AUDIENCE: 'https://api.vlaiqflow.app', FLOW_TEAM_CONTRIBUTORS_JSON: '[]',
};
const children = new Set(), controller = new AbortController();
let shutdown;
function stop(code) {
  return shutdown ??= (async () => {
    process.exitCode = code;
    controller.abort();
    const results = await Promise.allSettled([...children].map(child => stopTree(child)));
    if (results.some(result => result.status === 'rejected')) {
      console.error('A service could not be stopped. Inspect owned Node processes/ports before restarting.');
      process.exitCode = 1;
    }
    if (process.connected) process.disconnect();
  })();
}
process.once('SIGINT', () => void stop(0));
process.once('SIGTERM', () => void stop(0));
// Used by the native Windows CI smoke test; no HTTP shutdown endpoint is exposed.
process.on('message', message => {
  if (process.connected && message?.type === 'flow-acceptance-stop') void stop(0);
});
function run(name, cwd, entry, args, service = false) {
  const cmd = nodeCommand(entry, args);
  const child = spawn(cmd.executable, cmd.args, {
    cwd, env, stdio: 'inherit', shell: false, windowsHide: true, detached: process.platform !== 'win32',
  });
  children.add(child);
  const done = new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error(`${name} could not start. Run pnpm install --frozen-lockfile first.`)));
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${name} exited. Check its error above.`)));
  });
  if (service) void done.then(() => stop(1), () => stop(1));
  return done;
}
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Use Node.js 24.22.1 LTS (the tested version) for acceptance.');
  localDatabase(env.DATABASE_URL);
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('Remove NODE_TLS_REJECT_UNAUTHORIZED=0; TLS validation must stay enabled.');
  for (const port of [5173, 8787]) for (const host of ['127.0.0.1', '::1']) await freePort(port, host);
  const backend = createRequire(new URL('../backend/package.json', import.meta.url));
  const frontend = createRequire(new URL('../frontend/package.json', import.meta.url));
  const { Pool } = backend('pg');
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 3000 });
  try {
    const { rows } = await pool.query("SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS allowed");
    if (!rows[0]?.allowed) throw Object.assign(new Error(), { code: '42501' });
  } catch (error) {
    const hint = { '28P01': 'Database authentication failed.', '3D000': 'Acceptance database does not exist.', '42501': 'The local role needs CREATE on the acceptance public schema.' }[error.code]
      ?? 'PostgreSQL is not reachable. Start Docker Desktop/the local container and check its bound port.';
    throw new Error(hint + ' DATABASE_URL was not printed.');
  } finally { await pool.end(); }
  controller.signal.throwIfAborted();
  const loader = pathToFileURL(backend.resolve('tsx')).href;
  await run('Migration', join(root, 'backend'), '--import', [loader, 'scripts/migrate.ts']);
  controller.signal.throwIfAborted();
  run('Backend', join(root, 'backend'), '--import', [loader, 'src/index.ts'], true);
  run('Frontend', join(root, 'frontend'), join(dirname(frontend.resolve('vite/package.json')), 'bin', 'vite.js'), ['--host', '127.0.0.1', '--port', '5173', '--strictPort'], true);
  await Promise.all([
    waitForHttp('http://127.0.0.1:8787/api/health', { signal: controller.signal }),
    waitForHttp('http://127.0.0.1:5173/', { signal: controller.signal }),
  ]);
  console.log('READY: http://localhost:5173  API: http://localhost:8787 (loopback only).');
  console.log('Real Auth0 SDK; native permissions only. Run pnpm identity:connectivity before live login.');
  console.log('Ctrl+C stops both services; PostgreSQL and its account data are preserved.');
}
main().catch(async error => {
  if (!shutdown) {
    console.error(error.code === 'MODULE_NOT_FOUND' ? 'Dependencies missing. Run pnpm install --frozen-lockfile.' : error.message);
    await stop(1);
  }
});
