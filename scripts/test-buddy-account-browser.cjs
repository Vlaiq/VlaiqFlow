// Actual application + real PostgreSQL/RS256/host wallet; synthetic Auth0 SDK and AI, explicitly labeled.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright',
);
const accounts = JSON.parse(
  fs.readFileSync(
    process.env.BUDDY_FIXTURE_FILE || '/workspace/work/buddy-account-fixture.json',
    'utf8',
  ),
);
const base = process.env.BUDDY_ACCOUNT_URL || 'http://127.0.0.1:5174';
const output = process.env.BUDDY_SCREENSHOTS || '/workspace/work/buddy-account-browser';
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const reset = await fetch('http://127.0.0.1:8791/__buddy-fixture/reset', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accounts[0].token}` },
  });
  assert.equal(reset.status, 200, 'Reset isolated account fixtures');
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript((account) => {
      window.identityFixture = { account };
      localStorage.setItem('vlaiq.theme', 'light');
    }, accounts[0]);
    await context.route(/\/node_modules\/\.vite\/deps\/@auth0_auth0-react\.js/, (r) =>
      r.fulfill({
        contentType: 'application/javascript',
        body: "export {Auth0Provider,useAuth0} from '/identity-auth0-mock.tsx';",
      }),
    );
    await context.route(/\/api\/(me|motion|buddy)(\/|$|\?)/, async (r) => {
      const u = new URL(r.request().url());
      u.host = '127.0.0.1:8791';
      await r.fulfill({ response: await r.fetch({ url: u.toString() }) });
    });
    await context.route('https://tiles.openfreemap.org/**', (r) =>
      r.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            { id: 'blank-test-map', type: 'background', paint: { 'background-color': '#e6eee4' } },
          ],
        },
      }),
    );
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.setDefaultTimeout(30000);
    const timings = { missionMs: [] };
    await page.goto(base + '/challenges', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Cunoaște-l pe FLOW Buddy' }).waitFor();
    await page.getByRole('heading', { name: 'Fă loc mișcării.' }).waitFor();
    let measured = Date.now();
    await page.getByRole('button', { name: 'Cunoaște-l pe FLOW Buddy' }).click();
    await page.getByRole('heading', { name: /Salut, eu sunt Buddy/ }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/buddy');
    await page.getByText('0 / 6 lecții distincte finalizate').waitFor();
    timings.openBuddyMs = Date.now() - measured;
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      const n = document.createElement('div');
      n.id = 'buddy-test-notice';
      n.textContent =
        'DOVADĂ DE TEST · SDK Auth0 sintetic / RS256 local / Gemini sintetic / PostgreSQL real';
      n.style.cssText =
        'position:fixed;top:76px;left:104px;right:0;z-index:2147483647;padding:8px;background:#e7defa;color:#40276d;font:11px sans-serif;text-align:center';
      document.body.prepend(n);
    });
    await page.screenshot({
      path: path.join(output, 'buddy-mint-wave-account-fixture.png'),
      fullPage: true,
    });
    await page.evaluate(() => document.getElementById('buddy-test-notice').remove());
    let axeViolations = null;
    if (process.env.BUDDY_AXE_MODULE) {
      const AxeBuilder = require(process.env.BUDDY_AXE_MODULE).default;
      const audit = await new AxeBuilder({ page })
        .include('.buddy-page')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      axeViolations = audit.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      }));
      assert.deepEqual(axeViolations, [], 'Buddy WCAG automated audit');
    }
    const frames = await page.evaluate(async () => {
      const deltas = [];
      let last;
      for (let i = 0; i < 60; i++)
        await new Promise((resolve) =>
          requestAnimationFrame((time) => {
            if (last !== undefined) deltas.push(time - last);
            last = time;
            resolve();
          }),
        );
      deltas.sort((a, b) => a - b);
      return {
        frameMedianMs: deltas[Math.floor(deltas.length / 2)],
        frameP95Ms: deltas[Math.floor(deltas.length * 0.95)],
        heapBytes: performance.memory?.usedJSHeapSize ?? null,
        domNodes: document.querySelectorAll('*').length,
      };
    });
    for (const [label, choice] of [
      ['Un centru care respiră', 'Distribuție echilibrată'],
      ['Ultimul kilometru', 'Merg pe jos'],
      ['Mai puține ture', 'Compar costul și mersul pe jos'],
    ]) {
      if (label === 'Un centru care respiră')
        await page.getByRole('button', { name: 'Să încercăm' }).click();
      else {
        await page.getByRole('button', { name: 'Misiuni', exact: true }).click();
        await page.getByRole('button', { name: new RegExp(label) }).click();
      }
      await page.getByRole('radio', { name: new RegExp(choice) }).check();
      measured = Date.now();
      await page.getByRole('button', { name: 'Verifică alegerea' }).click();
      await page.getByText('+5 FLOW Coins · confirmate de server', { exact: true }).waitFor();
      timings.missionMs.push(Date.now() - measured);
    }
    await page.getByText('3 / 6 lecții distincte finalizate').waitFor();
    await page.getByRole('button', { name: 'Buddy Workshop', exact: true }).click();
    await page.getByText('15 FLOW Coins disponibile').waitFor();
    const ocean = page.locator('.buddy-cosmetics article').filter({ hasText: 'Albastru Bega' });
    await ocean.getByRole('button', { name: 'Cumpără', exact: true }).click();
    measured = Date.now();
    await page.getByRole('button', { name: 'Confirmă achiziția' }).click();
    await page.getByText('0 FLOW Coins disponibile', { exact: true }).waitFor();
    timings.purchaseMs = Date.now() - measured;
    await ocean.getByRole('button', { name: 'Echipează', exact: true }).click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('.buddy-stage .buddy-robot')
          ?.style.getPropertyValue('--buddy-accent') === '#79c9f2',
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('3 / 6 lecții distincte finalizate').waitFor();
    await page.waitForFunction(
      () =>
        document
          .querySelector('.buddy-stage .buddy-robot')
          ?.style.getPropertyValue('--buddy-accent') === '#79c9f2',
    );
    const field = page.getByRole('textbox', { name: 'Mesaj pentru Buddy' });
    await field.fill('Ce înseamnă energie recuperată?');
    await field.press('Enter');
    await page.getByText('BUDDY · RĂSPUNS DE TEST').waitFor();
    await page.evaluate(() => {
      const n = document.createElement('div');
      n.textContent =
        'DOVADĂ DE TEST · SDK Auth0 sintetic / RS256 local / Gemini sintetic / PostgreSQL real';
      n.style.cssText =
        'position:fixed;top:76px;left:104px;right:0;z-index:2147483647;padding:8px;background:#e7defa;color:#40276d;font:11px sans-serif;text-align:center';
      document.body.prepend(n);
    });
    await page.screenshot({
      path: path.join(output, 'buddy-persisted-account-fixture.png'),
      fullPage: true,
    });
    await page.goto(base + '/wallet', { waitUntil: 'domcontentloaded' });
    await page.getByText('Buddy Workshop', { exact: true }).waitFor();
    assert.match(await page.locator('.transaction-list').innerText(), /-15/);
    assert.equal(await page.getByText('Lecție FLOW Buddy', { exact: true }).count(), 3);
    await page.evaluate(() => {
      const n = document.createElement('div');
      n.textContent = 'DOVADĂ DE TEST · cont sintetic / PostgreSQL real / jurnalul FLOW existent';
      n.style.cssText =
        'position:fixed;top:76px;left:104px;right:0;z-index:2147483647;padding:8px;background:#e7defa;color:#40276d;font:11px sans-serif;text-align:center';
      document.body.prepend(n);
    });
    await page.screenshot({
      path: path.join(output, 'unified-wallet-fixture.png'),
      fullPage: true,
    });
    await page.goto(base + '/profile', { waitUntil: 'domcontentloaded' });
    await page.getByRole('region', { name: 'Progres educațional FLOW Buddy' }).waitFor();
    await page.getByText('Eco Explorer · 3 / 6 lecții finalizate').waitFor();
    await page.goto(base + '/buddy', { waitUntil: 'domcontentloaded' });
    await page.getByText('3 / 6 lecții distincte finalizate').waitFor();
    await page.evaluate((next) => window.identityFixture.switchAccount(next), accounts[1]);
    await page.getByText('0 / 6 lecții distincte finalizate').waitFor();
    assert.equal(await page.getByText('BUDDY · RĂSPUNS DE TEST').count(), 0);
    await page.evaluate(() => window.identityFixture.switchAccount(null));
    await page
      .getByRole('button', { name: /Conectează-te/ })
      .first()
      .waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Mesaj pentru Buddy' }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        result: 'PASS',
        application: 'REAL',
        postgres: 'REAL',
        wallet: 'EXISTING FLOW LEDGER',
        identity: 'SYNTHETIC SDK + LOCAL RS256',
        gemini: 'SYNTHETIC',
        voice: 'NOT TESTED',
        assertions:
          'protected discovery; preserved Motion; 3 lessons; real DB credits; purchase; equip; refresh; unified history; passport; account switch; guest gateway',
        errors,
        timings,
        performance: frames,
        axeViolations,
        output,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
