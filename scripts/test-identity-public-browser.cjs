// Real Auth0 SDK redirect construction, public routes and production API rejection.
// The authorize navigation is intercepted; this does NOT prove hosted login or token exchange.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.IDENTITY_TEST_URL || 'http://localhost:5173';
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
      page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.getByRole('combobox').waitFor();
    for (const path of [
      '/motion?mode=cycle',
      '/profile',
      '/wallet',
      '/settings',
      '/activities',
      '/navigation?mode=walk',
      '/data',
    ]) {
      await page.goto(base + path);
      await page.getByRole('heading', { name: 'Continuă în FLOW.' }).waitFor();
      assert.equal(await page.locator('.passport-person').count(), 0);
    }
    for (const path of ['/team', '/confidentialitate', '/help']) {
      await page.goto(base + path);
      assert.equal(await page.getByRole('heading', { name: 'Continuă în FLOW.' }).count(), 0);
    }
    let authorization = null;
    await context.route('https://dev-3a2ijpzkw4p8cng6.us.auth0.com/authorize**', (route) => {
      authorization = new URL(route.request().url());
      return route.fulfill({
        contentType: 'text/html',
        body: '<p>Authorize navigation captured by automated test. No login performed.</p>',
      });
    });
    for (const signup of [false, true]) {
      authorization = null;
      await page.goto(base + '/motion?mode=cycle');
      await page
        .getByRole('button', { name: signup ? 'Creează cont' : 'Conectează-te', exact: true })
        .last()
        .click();
      await page.waitForURL('https://dev-3a2ijpzkw4p8cng6.us.auth0.com/**');
      assert.ok(authorization);
      const p = authorization.searchParams;
      assert.equal(p.get('client_id'), '97hHmp8qdXa5H5eVcJz3nah9uBlNjvaU');
      assert.equal(p.get('audience'), 'https://api.vlaiqflow.app');
      assert.equal(p.get('redirect_uri'), 'http://localhost:5173/');
      assert.equal(p.get('code_challenge_method'), 'S256');
      assert.ok(p.get('code_challenge'));
      assert.ok(p.get('state'));
      assert.equal(p.get('ui_locales'), 'ro');
      assert.equal(p.get('connection'), null);
      assert.equal(p.get('screen_hint'), signup ? 'signup' : null);
    }
    for (const [path, method] of [
      ['me', 'GET'],
      ['motion/wallet', 'GET'],
      ['flow-voice/session', 'POST'],
    ]) {
      const r = await context.request.fetch(base + '/api/' + path, { method });
      assert.equal(r.status(), 401);
    }
    assert.deepEqual(errors, []);
    console.log(
      'PASS: public homepage/legal/team; all protected gateways; actual SDK login/signup PKCE, audience, Romanian locale; real private APIs return 401. Hosted auth not exercised.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
