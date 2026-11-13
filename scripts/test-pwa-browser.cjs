// Isolated service-worker fixture test; not a claim of physical-device installation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const publicRoot = path.resolve(__dirname, '../frontend/public');

(async () => {
  let revision = 1;
  let publicRequestIncludedCookie = false;
  const workerTemplate = fs.readFileSync(path.join(publicRoot, 'service-worker.js'), 'utf8');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/motion/wallet') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'Set-Cookie': 'fixture_private=local-test; Path=/; HttpOnly; SameSite=Strict' });
      res.end(JSON.stringify({ balance: 17, testFixture: true })); return;
    }
    if (url.pathname === '/service-worker.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
      res.end(workerTemplate.replace("const VERSION = 'vlaiq-shell-v1';", `const VERSION = 'vlaiq-shell-fixture-${revision}';`).replace('const BUILT_FILES = [];', "const BUILT_FILES = ['/assets/shell-test.js'];")); return;
    }
    if (url.pathname === '/assets/shell-test.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end("window.__shellReady = true; navigator.serviceWorker.register('/service-worker.js');"); return;
    }
    if (url.pathname === '/assets/after-login.js') {
      publicRequestIncludedCookie ||= !!req.headers.cookie;
      res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.end('window.publicFixture = true;'); return;
    }
    if (url.pathname === '/assets/authorized.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'private, no-store' }); res.end('/* private fixture */'); return;
    }
    if (url.pathname === '/' || url.pathname === '/motion') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><html lang="ro"><meta charset="utf-8"><title>VLAIQ PWA test fixture</title><body><h1>Public shell fixture</h1><script src="/assets/shell-test.js"></script></body></html>'); return;
    }
    const allowed = new Set(['/offline.html', '/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png']);
    if (!allowed.has(url.pathname)) { res.writeHead(404); res.end(); return; }
    const type = url.pathname.endsWith('.png') ? 'image/png' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : url.pathname.endsWith('.html') ? 'text/html' : 'application/manifest+json';
    res.writeHead(200, { 'Content-Type': type }); res.end(fs.readFileSync(path.join(publicRoot, url.pathname)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(base);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.evaluate(async () => {
      await fetch('/api/motion/wallet', { credentials: 'include' });
      await fetch('/assets/after-login.js', { credentials: 'include' });
      await fetch('/assets/authorized.js', { headers: { Authorization: 'fixture-only' } });
      window.__activeActivityMarker = 'preserved';
    });
    const keys = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(r => r.url)))).flat());
    assert(keys.some(url => url.endsWith('/assets/shell-test.js')));
    assert(keys.every(url => !url.includes('/api/') && !url.includes('/authorized.js')));
    assert.equal(publicRequestIncludedCookie, false, 'public asset cache fetch omits cookies');
    revision = 2;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
    assert.equal(await page.evaluate(() => window.__activeActivityMarker), 'preserved', 'worker update must not reload an active session');
    await context.setOffline(true);
    await page.goto(`${base}/motion`);
    await page.getByRole('heading', { name: 'Public shell fixture' }).waitFor();
    assert.equal(await page.evaluate(() => window.__shellReady), true);
    const apiAvailableOffline = await page.evaluate(() => fetch('/api/motion/wallet').then(() => true).catch(() => false));
    assert.equal(apiAvailableOffline, false, 'wallet is not replayed from cache offline');
    console.log('PASS: public app shell and built assets cached; API/authorization excluded; static fetches omit cookies; deep-link offline fallback works; pending update does not reload active session.');
    await context.close();
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
