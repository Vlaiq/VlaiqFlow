// Real SDK and production API handlers. No test identity, token or env-file writes.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const env = {
  ...process.env,
  NODE_ENV: 'development',
  API_PORT: '8787',
  CORS_ORIGINS: 'http://localhost:5173',
  VITE_API_URL: '',
  VITE_AUTH0_DOMAIN: 'dev-3a2ijpzkw4p8cng6.us.auth0.com',
  VITE_AUTH0_CLIENT_ID: '97hHmp8qdXa5H5eVcJz3nah9uBlNjvaU',
  VITE_AUTH0_AUDIENCE: 'https://api.vlaiqflow.app',
  VITE_AUTH0_REDIRECT_URI: 'http://localhost:5173/',
  VITE_AUTH0_LOGOUT_URI: 'http://localhost:5173/',
  AUTH0_ISSUER_BASE_URL: 'https://dev-3a2ijpzkw4p8cng6.us.auth0.com/',
  AUTH0_AUDIENCE: 'https://api.vlaiqflow.app',
  FLOW_TEAM_CONTRIBUTORS_JSON: '[]',
};
// Require an explicit real-account database; keep the disposable fixtures separate.
let databaseReady = false;
try {
  const db = new URL(env.DATABASE_URL);
  databaseReady = ['postgres:', 'postgresql:'].includes(db.protocol) && !db.pathname.endsWith('_test');
} catch { /* Never print a connection string in a URL parsing error. */ }
if (!databaseReady) {
  console.error('Set DATABASE_URL to the persistent local acceptance database (not a _test DB).');
  process.exit(1);
}
const grouped = process.platform !== 'win32';
const run = (args) => spawn('pnpm', args, { cwd, env, stdio: 'inherit', detached: grouped });
const migration = run(['-F', 'backend', 'db:migrate']);
const migrated = await new Promise((resolve) => {
  migration.once('error', () => resolve(1));
  migration.once('exit', (code) => resolve(code ?? 1));
});
if (migrated !== 0) process.exit(1);
console.log('Real Auth0 acceptance: http://localhost:5173/profile (requires tenant connectivity).');
console.log('Native Auth0 permissions only; application-managed contributor grants are disabled.');
const children = [run(['-F', 'backend', 'start']), run(['-F', 'frontend', 'dev', '--strictPort'])];
let stopping = false;
const stop = (code) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      if (grouped && child.pid) process.kill(-child.pid, 'SIGTERM');
      else child.kill('SIGTERM');
    } catch { /* A sibling may already have exited. */ }
  }
  process.exitCode = code;
};
for (const child of children) {
  child.once('error', () => stop(1));
  child.once('exit', (code) => stop(code ?? 1));
}
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
