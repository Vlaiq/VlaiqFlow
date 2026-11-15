import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createServer as httpServer } from 'node:http';
import { localDatabase, nodeCommand, freePort, windowsKillCommand, stopTree, waitForHttp } from './identity-process.mjs';

test('local acceptance refuses remote/system/test databases without reflecting credentials', () => {
  for (const url of ['postgresql://private:secret@remote.invalid/prod', 'postgresql://localhost/flow_TEST', 'postgresql://localhost/postgres', 'postgresql://localhost/db?host=remote.invalid', 'private invalid']) {
    assert.throws(() => localDatabase(url), error => !error.message.includes('secret') && !error.message.includes(url));
  }
  assert.equal(localDatabase('postgresql://flow@127.0.0.1/flow_identity').hostname, '127.0.0.1');
  assert.equal(localDatabase('postgresql://flow@[::1]/flow_identity').hostname, '[::1]');
});
test('Node entry paths with spaces and shell metacharacters execute literally', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'flow operator & '));
  try {
    const entry = join(dir, 'entry file.cjs');
    await writeFile(entry, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))');
    const literal = 'name & echo unsafe; $(echo unsafe)';
    const cmd = nodeCommand(entry, [literal]);
    const child = spawn(cmd.executable, cmd.args, { shell: cmd.shell, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => output += chunk);
    const code = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
    assert.equal(code, 0); assert.deepEqual(JSON.parse(output), [literal]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('an occupied IPv4 port is detected without terminating its owner', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await assert.rejects(freePort(server.address().port, '127.0.0.1'), /Port .* unavailable/); assert.equal(server.listening, true); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
test('an occupied IPv6 localhost port is detected', async t => {
  const server = createServer();
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '::1', resolve); }); }
  catch (error) { if (['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) return t.skip('IPv6 unavailable on this machine'); throw error; }
  try { await assert.rejects(freePort(server.address().port, '::1'), /Port .* unavailable/); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
test('Windows cleanup targets only a validated owned PID, never a shell command', async () => {
  assert.throws(() => windowsKillCommand('1 & other'), /Invalid owned/);
  const cmd = windowsKillCommand(123, 'C:\\Windows');
  assert.equal(cmd.executable, 'C:\\Windows\\System32\\taskkill.exe');
  assert.deepEqual(cmd.args, ['/PID', '123', '/T', '/F']); assert.equal(cmd.shell, false);
  let used;
  await stopTree({ pid: 123, exitCode: null, signalCode: null }, { platform: 'win32', spawnCommand: (executable, args, options) => {
    used = { executable, args, options }; const result = new EventEmitter(); queueMicrotask(() => result.emit('exit', 0)); return result;
  } });
  assert.equal(used.options.shell, false); assert.equal(used.options.stdio, 'ignore');
});
test('native process-tree cleanup closes a descendant service', { timeout: 10000 }, async () => {
  const descendant = "process.on('SIGTERM',()=>{});require('node:net').createServer().listen(0,'127.0.0.1',function(){console.log(this.address().port)})";
  const parent = `const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore','pipe','ignore']});c.stdout.pipe(process.stdout);setInterval(()=>{},1000)`;
  const child = spawn(process.execPath, ['-e', parent], { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const port = await new Promise((resolve, reject) => { child.stdout.once('data', chunk => resolve(Number(chunk.toString().trim()))); child.once('error', reject); });
    assert.ok(port > 0);
    await stopTree(child);
    // The OS may deliver the descendant's termination after the parent close event.
    const deadline = Date.now() + 1500;
    while (true) {
      try { await freePort(port, '127.0.0.1'); break; }
      catch (error) { if (Date.now() >= deadline) throw error; await new Promise(resolve => setTimeout(resolve, 20)); }
    }
  } finally { await stopTree(child); }
});
test('HTTP readiness checks a real responding server and supports cancellation', async () => {
  const server = httpServer((_req, res) => res.end('ok'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await waitForHttp(`http://127.0.0.1:${server.address().port}`);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(waitForHttp('http://127.0.0.1:1', { signal: controller.signal }), /abort/i);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
