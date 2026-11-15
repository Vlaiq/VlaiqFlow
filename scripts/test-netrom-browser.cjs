// Actual application + production handoff handlers/RS256/MapLibre. Synthetic Auth0 SDK and routes/AI.
const assert = require('node:assert/strict'),
  fs = require('node:fs');
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    '/opt/codex/cua_node/lib/node_modules/playwright',
);
const accounts = JSON.parse(
  fs.readFileSync(
    process.env.NETROM_FIXTURE_FILE || '/workspace/work/netrom-accounts.json',
    'utf8',
  ),
);
const base = process.env.NETROM_URL || 'http://localhost:5173';
const output = process.env.NETROM_OUTPUT || '/workspace/work/netrom-browser';
const scenario = async (body) => {
  const r = await fetch('http://127.0.0.1:8792/__netrom-fixture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(r.status, 200);
};
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await scenario({});
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.addInitScript(() => {
      window.identityFixture = {
        account: JSON.parse(
          sessionStorage.getItem('netrom-test-account') || 'null',
        ),
      };
      localStorage.setItem('vlaiq.theme', 'light');
    });
    await context.route(
      /\/node_modules\/\.vite\/deps\/@auth0_auth0-react\.js/,
      (r) =>
        r.fulfill({
          contentType: 'application/javascript',
          body: "export {Auth0Provider,useAuth0} from '/identity-auth0-mock.tsx';",
        }),
    );
    let completeRequests = 0,
      latestInput;
    await context.route('**/api/**', async (r) => {
      if (r.request().url().includes('/api/journeys/complete')) {
        completeRequests++;
        latestInput = r.request().postDataJSON();
      }
      const u = new URL(r.request().url());
      u.host = '127.0.0.1:8792';
      await r.fulfill({ response: await r.fetch({ url: u.toString() }) });
    });
    await context.route('https://tiles.openfreemap.org/**', (r) =>
      r.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'test-blank-map',
              type: 'background',
              paint: { 'background-color': '#eaf0e9' },
            },
          ],
        },
      }),
    );
    const page = await context.newPage(),
      errors = [],
      evidence = {
        fixtures:
          'Synthetic Auth0 SDK/accounts/providers; real signed RS256, application, handoff handlers and MapLibre',
      };
    page.on('pageerror', (e) => errors.push(e.message));
    page.setDefaultTimeout(20000);
    const shot = async (name) => {
      await page.addStyleTag({
        content:
          'body:after{content:"TEST LOCAL · AUTH0/RUTE/GEMINI SINTETICE · MAPLIBRE ȘI VALIDARE RS256 REALE";position:fixed;bottom:4px;left:8px;z-index:99999;padding:8px;background:#ede1ab;color:#322a15;font:12px sans-serif;pointer-events:none}',
      });
      await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    };
    const demo = async () => {
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Încearcă DEMO/ }).click();
      await page.getByRole('button', { name: 'Trasee', exact: true }).click();
      await page
        .getByRole('button', {
          name: 'Întreabă-l pe Buddy despre drumul acesta',
          exact: true,
        })
        .waitFor();
    };
    const ask = async () => {
      await page
        .getByRole('button', { name: 'Întreabă-l pe Buddy', exact: true })
        .click();
      await page.locator('.buddy-journey-answer').waitFor();
    };
    const verifyMap = async (optionId, revision) => {
      await page.waitForFunction(
        ({ optionId, revision }) => {
          const selected = document.querySelector('.journey-option.selected');
          const map = window.__vlaiqMap;
          if (
            selected?.getAttribute('data-option-id') !== optionId ||
            selected?.getAttribute('data-revision') !== revision ||
            !map?.getSource('flow-complete-journey')
          )
            return false;
          return map
            .queryRenderedFeatures()
            .some(
              (f) =>
                f.properties?.journeyId === optionId &&
                f.properties?.revision === revision,
            );
        },
        { optionId, revision },
      );
      const rendered = await page.evaluate(() => ({
        selectedId: document
          .querySelector('.journey-option.selected')
          .getAttribute('data-option-id'),
        selectedRevision: document
          .querySelector('.journey-option.selected')
          .getAttribute('data-revision'),
        features: window.__vlaiqMap
          .queryRenderedFeatures()
          .filter((f) => f.properties?.journeyId)
          .map((f) => ({
            id: f.properties.journeyId,
            revision: f.properties.revision,
            mode: f.properties.mode,
          })),
      }));
      assert.equal(rendered.selectedId, optionId);
      assert.equal(rendered.selectedRevision, revision);
      assert(rendered.features.length);
      assert(
        rendered.features.every(
          (f) => f.id === optionId && f.revision === revision,
        ),
      );
      return rendered;
    };
    // Guest map → gateway → full-page redirect simulation → original Buddy reference.
    await demo();
    await page
      .getByRole('button', { name: 'Cea mai rapidă', exact: true })
      .click();
    const inputBefore = structuredClone(latestInput),
      requestsBefore = completeRequests;
    await shot('01-map-before-buddy');
    await page
      .getByRole('button', {
        name: 'Întreabă-l pe Buddy despre drumul acesta',
        exact: true,
      })
      .click();
    const buddyUrl = page.url(),
      reference = Object.fromEntries(new URL(buddyUrl).searchParams);
    await page
      .locator('.identity-gateway')
      .getByRole('button', { name: /Conectează-te/ })
      .click();
    const login = await page.evaluate(() => window.identityFixture.login);
    assert.equal(
      login.appState.returnTo,
      new URL(buddyUrl).pathname + new URL(buddyUrl).search,
    );
    await page.evaluate(
      (a) => sessionStorage.setItem('netrom-test-account', JSON.stringify(a)),
      accounts[0],
    );
    await page.goto(base + '/?code=SYNTHETIC_CALLBACK&state=SYNTHETIC_STATE');
    await page.waitForFunction(() => !!window.identityFixture.callback);
    await page.evaluate(
      (target) => window.identityFixture.callback(target),
      login.appState.returnTo,
    );
    await page
      .getByRole('heading', { name: 'Hai să înțelegem drumul acesta.' })
      .waitFor();
    assert.equal(page.url(), buddyUrl);
    await page.getByLabel('Întreabă despre limita de mers pe jos').waitFor();
    await ask();
    const answer = page.locator('.buddy-journey-answer'),
      explained = await answer.getAttribute('data-explained-option-id'),
      revision = await answer.getAttribute('data-revision');
    assert.equal(explained, 'fixture-cycle');
    assert.equal(revision, reference.revision);
    await shot('02-buddy-eight-minute-answer');
    await page
      .getByRole('button', { name: 'Arată-mi ruta', exact: true })
      .click();
    evidence.roundTrip = await verifyMap(explained, revision);
    assert.equal(
      completeRequests,
      requestsBefore,
      'Return must restore, never silently recalculate',
    );
    assert.deepEqual(latestInput, inputBefore);
    assert.equal(
      await page
        .getByRole('button', { name: 'Cea mai rapidă', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    await shot('03-map-same-option-and-revision');
    await page.reload();
    await verifyMap(explained, revision);
    assert.equal(
      completeRequests,
      requestsBefore,
      'Reload restores the validated revision',
    );
    evidence.loginReturn =
      'PASS: same reference survives full-page SDK callback simulation';
    // Another real locally signed identity cannot read the account-bound comparison.
    await page.evaluate((a) => {
      sessionStorage.setItem('netrom-test-account', JSON.stringify(a));
      window.identityFixture.switchAccount(a);
    }, accounts[1]);
    await page.goto(buddyUrl);
    await page
      .getByText('Această comparație aparține altei sesiuni sau altui cont.', {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page
        .getByRole('button', { name: 'Arată-mi ruta', exact: true })
        .count(),
      0,
    );
    evidence.otherAccount = 'PASS: 403';
    await page.evaluate(
      (a) => sessionStorage.setItem('netrom-test-account', JSON.stringify(a)),
      accounts[0],
    );
    await scenario({ expired: true });
    await page.goto(buddyUrl);
    await page.getByText(/Comparația s-a schimbat sau a expirat/).waitFor();
    await shot('04-expired-recalculation-required');
    evidence.expiry = 'PASS: 409, no selection';
    const beforeRecalculation = completeRequests;
    await page
      .getByRole('link', {
        name: 'Revino la hartă pentru recalculare',
        exact: true,
      })
      .click();
    await page.locator('.journey-handoff-error').waitFor();
    assert.equal(
      completeRequests,
      beforeRecalculation,
      'Expired return cannot silently recalculate',
    );
    await page
      .getByRole('button', { name: 'Recalculează comparația', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: 'Întreabă-l pe Buddy despre drumul acesta',
        exact: true,
      })
      .waitFor();
    assert(completeRequests > beforeRecalculation);
    assert.deepEqual(latestInput.origin, inputBefore.origin);
    assert.deepEqual(latestInput.destination, inputBefore.destination);
    assert.equal(latestInput.stayMinutes, inputBefore.stayMinutes);
    assert.equal(latestInput.maxWalkMinutes, inputBefore.maxWalkMinutes);
    evidence.recalculation =
      'PASS: original inputs preserved; explicit calculation creates a fresh reference';
    await scenario({ walkOnly: true });
    await demo();
    await page
      .getByRole('button', {
        name: 'Întreabă-l pe Buddy despre drumul acesta',
        exact: true,
      })
      .click();
    await ask();
    await page
      .getByText(
        'Setul comparat nu conține o variantă eligibilă. Ajustează limita de mers pe jos.',
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await page
        .getByRole('button', { name: 'Arată-mi ruta', exact: true })
        .count(),
      0,
    );
    await page
      .getByLabel('Întreabă despre limita de mers pe jos')
      .fill('Care variantă mă lasă să merg cel mult 25 minute pe jos?');
    await ask();
    await page.waitForFunction(
      () =>
        document
          .querySelector('.buddy-journey-answer')
          ?.getAttribute('data-explained-option-id') === 'fixture-walk',
    );
    const adjustedRevision = await page
      .locator('.buddy-journey-answer')
      .getAttribute('data-revision');
    await page
      .getByRole('button', { name: 'Arată-mi ruta', exact: true })
      .click();
    await verifyMap('fixture-walk', adjustedRevision);
    evidence.noEligible =
      'PASS: exact empty-set message; adjusting limit allows original walking option';
    await scenario({ outage: true });
    await demo();
    await page
      .getByRole('button', {
        name: 'Întreabă-l pe Buddy despre drumul acesta',
        exact: true,
      })
      .click();
    await ask();
    await page
      .getByText(/Rezultat verificat de cod · Gemini indisponibil/)
      .waitFor();
    const fallbackId = await page
        .locator('.buddy-journey-answer')
        .getAttribute('data-explained-option-id'),
      fallbackRev = await page
        .locator('.buddy-journey-answer')
        .getAttribute('data-revision');
    await shot('05-gemini-outage-valid-facts');
    await page
      .getByRole('button', { name: 'Arată-mi ruta', exact: true })
      .click();
    await verifyMap(fallbackId, fallbackRev);
    evidence.geminiOutage =
      'PASS: facts and exact map selection remain available';
    // Supersede while Buddy is open; never navigate with an obsolete explanation.
    await page
      .getByRole('button', {
        name: 'Întreabă-l pe Buddy despre drumul acesta',
        exact: true,
      })
      .click();
    await ask();
    await page.evaluate(async () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Flow-Journey-Session': sessionStorage.getItem(
          'flow-journey-session',
        ),
      };
      const response = await fetch('/api/journeys/complete', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          origin: [21.207, 45.7503],
          destination: [21.2257, 45.7537],
        }),
      });
      if (!response.ok) throw new Error('Unable to supersede fixture');
    });
    await page
      .getByRole('button', { name: 'Arată-mi ruta', exact: true })
      .click();
    await page.getByText(/Comparația s-a schimbat sau a expirat/).waitFor();
    assert.equal(new URL(page.url()).pathname, '/buddy');
    evidence.changedComparison = 'PASS: obsolete selection blocked';
    assert.deepEqual(errors, []);
    evidence.pageErrors = errors;
    fs.writeFileSync(
      `${output}/results.json`,
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
