// Compiled public-shell and private-route gateway verification. No hosted Auth0 login.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
      page = await context.newPage();
    await page.goto((process.env.IDENTITY_PRODUCTION_URL || 'http://localhost:8887') + '/');
    await page.getByRole('combobox').waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const keys = await page.evaluate(async () => {
      const list = await caches.keys(),
        out = [];
      for (const k of list) {
        const c = await caches.open(k);
        out.push(...(await c.keys()).map((r) => new URL(r.url).pathname));
      }
      return out;
    });
    assert.equal(
      keys.some((k) => k.startsWith('/api/')),
      false,
    );
    assert.ok(keys.some((k) => k.startsWith('/assets/')));
    await page.goto((process.env.IDENTITY_PRODUCTION_URL || 'http://localhost:8887') + '/profile');
    await page.getByRole('heading', { name: 'Continuă în FLOW.' }).waitFor();
    await context.setOffline(true);
    await page.goto((process.env.IDENTITY_PRODUCTION_URL || 'http://localhost:8887') + '/');
    await page.getByRole('combobox').waitFor();
    console.log(
      'PASS: compiled SPA public homepage, protected deep link, PWA registration, public assets cached, no API cache, offline public shell. Auth0 URLs intentionally remain localhost:5173; no live login at preview port.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
