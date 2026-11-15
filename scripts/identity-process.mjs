import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { win32 } from 'node:path';

export function localDatabase(value) {
  try {
    const url = new URL(value), name = decodeURIComponent(url.pathname.slice(1));
    if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        !name || /(?:_test|template[01]|^postgres)$/i.test(name) || url.searchParams.has('host')) throw new Error();
    return url;
  } catch {
    throw new Error('Set DATABASE_URL to a local acceptance database, not a remote, system or _test database. Its value is never logged.');
  }
}
// Direct Node entry points avoid pnpm.cmd/cmd.exe and preserve paths with spaces literally.
export function nodeCommand(entry, args = [], executable = process.execPath) {
  return { executable, args: [entry, ...args], shell: false };
}
export async function freePort(port, host) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', error => {
      if (host === '::1' && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) resolve();
      else reject(new Error(`Port ${port} is unavailable on ${host}. Stop the existing service; no process was killed.`));
    });
    server.listen({ port, host, exclusive: true }, () => server.close(resolve));
  });
}
export function windowsKillCommand(pid, systemRoot = process.env.SystemRoot ?? 'C:\\Windows') {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid owned child PID.');
  if (!win32.isAbsolute(systemRoot)) throw new Error('Invalid Windows system directory.');
  return { executable: win32.join(systemRoot, 'System32', 'taskkill.exe'), args: ['/PID', String(pid), '/T', '/F'], shell: false };
}
export async function stopTree(child, { platform = process.platform, spawnCommand = spawn, graceMs = 1500 } = {}) {
  if (!child.pid) return;
  if (platform === 'win32') {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const cmd = windowsKillCommand(child.pid);
    await new Promise((resolve, reject) => {
      const killer = spawnCommand(cmd.executable, cmd.args, { shell: false, windowsHide: true, stdio: 'ignore' });
      killer.once('error', () => reject(new Error('Windows process cleanup failed. Check owned service PIDs before restarting.')));
      killer.once('exit', code => code === 0 || child.exitCode !== null || child.signalCode !== null
        ? resolve() : reject(new Error('Windows process cleanup failed. Check owned service PIDs before restarting.')));
    });
    return;
  }
  const signal = sig => {
    try { process.kill(-child.pid, sig); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  signal('SIGTERM');
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise(resolve => {
      const timer = setTimeout(done, graceMs);
      function done() { clearTimeout(timer); child.off('close', done); resolve(); }
      child.once('close', done);
    });
  }
  signal('SIGKILL'); // also remove descendants whose parent exited first
}
export async function waitForHttp(url, { signal, timeoutMs = 20000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(1500), ...(signal ? [signal] : [])]) });
      if (response.ok) { await response.body?.cancel(); return; }
      await response.body?.cancel();
    } catch { signal?.throwIfAborted(); }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('FLOW startup timed out. Check the service error above and database readiness.');
}
