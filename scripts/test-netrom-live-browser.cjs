// Real Timpark/OSM snapshot, HeiGIT and Gemini. Only Auth0 SDK/accounts and base-map style are fixtures.
const assert = require('node:assert/strict'),
  fs = require('node:fs');
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    '/opt/codex/cua_node/lib/node_modules/playwright',
);
const accounts = JSON.parse(
  fs.readFileSync(process.env.NETROM_FIXTURE_FILE || '/workspace/work/netrom-live-accounts.json', 'utf8'),
);
const output = process.env.NETROM_OUTPUT || '/workspace/work/netrom-live-browser';
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.addInitScript((account) => {
      window.identityFixture = { account };
      localStorage.setItem('vlaiq.theme', 'light');
    }, accounts[0]);
    await context.route(
      /\/node_modules\/\.vite\/deps\/@auth0_auth0-react\.js/,
      (r) =>
        r.fulfill({
          contentType: 'application/javascript',
          body: "export {Auth0Provider,useAuth0} from '/identity-auth0-mock.tsx';",
        }),
    );
    let comparison, explanation;
    await context.route('**/api/**', async (r) => {
      const u = new URL(r.request().url());
      u.host = '127.0.0.1:8793';
      const response = await r.fetch({ url: u.toString(), timeout: 50000 });
      if (u.pathname === '/api/journeys/complete' && response.ok())
        comparison = await response.json();
      if (u.pathname === '/api/journey-buddy/explain' && response.ok())
        explanation = await response.json();
      await r.fulfill({ response });
    });
    await context.route('https://tiles.openfreemap.org/**', (r) =>
      r.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'local-test-style',
              type: 'background',
              paint: { 'background-color': '#eaf0e9' },
            },
          ],
        },
      }),
    );
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.setDefaultTimeout(50000);
    await page.goto(process.env.NETROM_URL || 'http://localhost:5173', { waitUntil: 'domcontentloaded' });
    const started = Date.now();
    await page.getByRole('button', { name: /Încearcă DEMO/ }).click();
    await page.getByRole('button', { name: 'Trasee', exact: true }).click();
    await page
      .getByRole('button', {
        name: 'Întreabă-l pe Buddy despre drumul acesta',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Întreabă-l pe Buddy', exact: true })
      .click();
    await page.locator('.buddy-journey-answer').waitFor();
    assert(explanation && comparison, 'The live API returned both snapshots');
    assert.deepEqual(explanation.snapshot.value.journeys, comparison.journeys);
    assert(
      comparison.journeys.some((j) => j.parking?.source.includes('Timpark')),
      'Municipal Timpark provenance',
    );
    assert(
      comparison.journeys.some((j) =>
        j.parking?.source.includes('OpenStreetMap'),
      ),
      'OSM parking provenance',
    );
    assert(
      comparison.journeys.every((j) =>
        j.legs
          .filter((l) => l.type !== 'parking')
          .every((l) => l.duration.source.includes('openrouteservice')),
      ),
      'Every moving leg comes from actual HeiGIT',
    );
    await page.addStyleTag({
      content:
        'body:after{content:"HEIGIT/TIMPARK/OSM REALE · AUTH0 SDK ȘI IDENTITATE DE TEST · GEMINI: verificați sursa afișată";position:fixed;bottom:4px;left:8px;z-index:99999;padding:8px;background:#ede1ab;color:#322a15;font:12px sans-serif;pointer-events:none}',
    });
    await page.screenshot({
      path: `${output}/buddy-live-facts.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Arată-mi ruta', exact: true })
      .click();
    await page.waitForFunction(
      ({ id, revision }) =>
        document
          .querySelector('.journey-option.selected')
          ?.getAttribute('data-option-id') === id &&
        window.__vlaiqMap
          ?.queryRenderedFeatures()
          .some(
            (f) =>
              f.properties?.journeyId === id &&
              f.properties?.revision === revision,
          ),
      { id: explanation.optionId, revision: explanation.reference.revision },
    );
    const features = await page.evaluate(() =>
      window.__vlaiqMap
        .queryRenderedFeatures()
        .filter((f) => f.properties?.journeyId)
        .map((f) => ({
          id: f.properties.journeyId,
          revision: f.properties.revision,
        })),
    );
    assert(
      features.length &&
        features.every(
          (f) =>
            f.id === explanation.optionId &&
            f.revision === explanation.reference.revision,
        ),
    );
    await page.screenshot({ path: `${output}/map-same-live-route.png` });
    assert.deepEqual(errors, []);
    const result = {
      identity: 'LOCAL RS256 TEST ACCOUNT, NOT REAL AUTH0 LOGIN',
      basemap: 'blank fixture; actual MapLibre + municipal layers',
      providers: 'REAL HeiGIT and real Timpark/OSM local snapshots',
      gemini: explanation.source,
      modelNarrative: explanation.text,
      options: comparison.journeys.length,
      explainedOptionId: explanation.optionId,
      drawnOptionIds: [...new Set(features.map((f) => f.id))],
      revision: explanation.reference.revision,
      elapsedMs: Date.now() - started,
      selected: comparison.journeys.find((j) => j.id === explanation.optionId),
      pageErrors: errors,
    };
    fs.writeFileSync(`${output}/results.json`, JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify(
        {
          ...result,
          selected: {
            category: result.selected.category,
            duration: result.selected.travelSeconds,
            walking: result.selected.legs
              .filter((l) => l.type === 'walk')
              .map((l) => l.duration),
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
