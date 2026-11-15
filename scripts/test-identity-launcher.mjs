// Real local PostgreSQL and actual app processes. No Auth0 login/identity is simulated.
import { fork } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { freePort } from './identity-process.mjs';

for (const port of [5173, 8787]) await freePort(port, '127.0.0.1');
const child = fork(fileURLToPath(new URL('./start-identity-acceptance.mjs', import.meta.url)), [], {
  env: process.env, silent: true,
});
const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Launcher readiness timed out.')), 25000);
    let text = '';
    child.stdout.on('data', chunk => {
      text = (text + chunk.toString()).slice(-5000);
      if (text.includes('READY: http://localhost:5173')) { clearTimeout(timer); resolve(); }
    });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Launcher exited before readiness.')); });
    child.once('error', () => { clearTimeout(timer); reject(new Error('Launcher could not start.')); });
  });
  for (const path of ['/api/me', '/api/motion/wallet']) {
    const r = await fetch('http://127.0.0.1:8787' + path);
    assert.equal(r.status, 401);
    await r.body?.cancel();
  }
  child.send({ type: 'flow-acceptance-stop' });
  const code = await Promise.race([exited, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('Launcher shutdown timed out.')), 8000); timer.unref();
  })]);
  assert.equal(code, 0);
  for (const port of [5173, 8787]) {
    const deadline = Date.now() + 2000;
    while (true) {
      try { await freePort(port, '127.0.0.1'); break; }
      catch (error) { if (Date.now() >= deadline) throw error; await new Promise(resolve => setTimeout(resolve, 25)); }
    }
  }
  console.log('LOCAL PASS: PostgreSQL migration, real app readiness, private API 401, IPC shutdown and both ports released. No real Auth0 authentication claimed.');
} finally {
  if (child.connected) child.send({ type: 'flow-acceptance-stop' });
}
