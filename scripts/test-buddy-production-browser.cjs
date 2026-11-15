// Compiled production app, no synthetic SDK: guest gateway, public lazy loading and PWA boundaries.
const assert = require('node:assert/strict');
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright',
);
const base = process.env.BUDDY_PRODUCTION_URL || 'http://127.0.0.1:8887';
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
      page = await context.newPage();
    const buddyRequests = [];
    page.on('request', (req) => {
      if (/\/assets\/(?:Buddy|buddy-|audio-)/.test(req.url())) buddyRequests.push(req.url());
    });
    await context.route('https://tiles.openfreemap.org/**', (r) =>
      r.fulfill({
        json: { version: 8, sources: {}, layers: [{ id: 'blank-test-style', type: 'background' }] },
      }),
    );
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('combobox').waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const cachePaths = await page.evaluate(async () => {
      const out = [];
      for (const name of await caches.keys())
        for (const req of await (await caches.open(name)).keys())
          out.push(new URL(req.url).pathname);
      return out;
    });
    assert.deepEqual(
      buddyRequests,
      [],
      'Public homepage and SW must not fetch full Buddy/audio chunks',
    );
    assert.equal(
      cachePaths.some((p) => p.startsWith('/api/') || /\/assets\/(?:Buddy|buddy-|audio-)/.test(p)),
      false,
    );
    assert.ok(cachePaths.some((p) => p.startsWith('/assets/')));
    await page.goto(base + '/buddy', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Continuă în FLOW.' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Mesaj pentru Buddy' }).count(), 0);
    const statuses = await page.evaluate(async () => {
      const out = [];
      for (const [path, method] of [
        ['state', 'GET'],
        ['chat', 'POST'],
        ['missions/answer', 'POST'],
        ['cosmetics/purchase', 'POST'],
        ['speech', 'POST'],
      ]) {
        const r = await fetch('/api/buddy/' + path, { method });
        out.push({ path, status: r.status, cache: r.headers.get('cache-control') });
      }
      return out;
    });
    assert.ok(statuses.every((s) => s.status === 401 && s.cache === 'no-store'));
    await context.setOffline(true);
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('combobox').waitFor();
    console.log(
      JSON.stringify({
        result: 'PASS',
        productionBuild: true,
        auth0SDK: 'REAL',
        identity: 'GUEST ONLY; NO LIVE LOGIN',
        buddyOnPublicHomepage: false,
        buddyPrecached: false,
        apiCached: false,
        offlinePublicShell: true,
        statuses,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
