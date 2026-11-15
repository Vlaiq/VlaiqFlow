// WCAG automated scan with the synthetic identity fixture; not a screen-reader user study.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'),
  assert = require('node:assert/strict');
const account = JSON.parse(
  fs.readFileSync(process.env.IDENTITY_FIXTURE_FILE || '/tmp/flow-identity-browser-fixture.json'),
)[0];
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript((account) => {
      window.identityFixture = { account };
    }, account);
    await context.route(/\/node_modules\/\.vite\/deps\/@auth0_auth0-react\.js/, (r) =>
      r.fulfill({
        contentType: 'application/javascript',
        body: "export {Auth0Provider,useAuth0} from '/identity-auth0-mock.tsx'",
      }),
    );
    await context.route(/\/api\/(me|motion|team)(\/|$|\?)/, async (r) => {
      const u = new URL(r.request().url());
      u.host = '127.0.0.1:8790';
      await r.fulfill({ response: await r.fetch({ url: u.toString() }) });
    });
    const page = await context.newPage();
    for (const path of ['/profile', '/profile/edit', '/team']) {
      await page.goto((process.env.IDENTITY_TEST_URL || 'http://localhost:5173') + path);
      await page
        .locator(
          path === '/profile'
            ? '.passport-person'
            : path === '/team'
              ? '.team-hero'
              : '.identity-form',
        )
        .first()
        .waitFor();
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      );
      await page.addScriptTag({
        path: process.env.AXE_CORE_PATH || require.resolve('axe-core/axe.min.js'),
      });
      const result = await page.evaluate(async () => {
        const r = await axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        });
        return r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.map((n) => ({ html: n.html, summary: n.failureSummary })),
        }));
      });
      console.log(path, JSON.stringify(result));
      assert.deepEqual(result, [], 'WCAG checks ' + path);
      if (path === '/profile') {
        if (process.env.IDENTITY_EVIDENCE_DIR) {
          await page.screenshot({
            path: process.env.IDENTITY_EVIDENCE_DIR + '/passport-mobile-fresh.png',
            fullPage: true,
          });
        }
      }
    }
    await page.evaluate(() => window.identityFixture.switchAccount(null));
    await page.goto((process.env.IDENTITY_TEST_URL || 'http://localhost:5173') + '/motion');
    // New document uses initial test session; explicit transition to guest exercises the gateway.
    await page.evaluate(() => window.identityFixture.switchAccount(null));
    await page.getByRole('heading', { name: 'Continuă în FLOW.' }).waitFor();
    await page.addScriptTag({
      path: process.env.AXE_CORE_PATH || require.resolve('axe-core/axe.min.js'),
    });
    const gateway = await page.evaluate(async () => {
      const r = await axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      });
      return r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.failureSummary),
      }));
    });
    console.log('gateway', JSON.stringify(gateway));
    assert.deepEqual(gateway, [], 'Gateway WCAG checks');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
