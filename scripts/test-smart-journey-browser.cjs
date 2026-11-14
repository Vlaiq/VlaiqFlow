const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { completeFixture } = require('./lib/smart-journey-fixture.cjs');
const assert = require('node:assert/strict'),
  fs = require('node:fs');
const base = process.env.NAV_TEST_URL || 'http://localhost:5173';
const output = process.env.JOURNEY_TEST_OUTPUT || '/tmp/vlaiq-smart-journey';
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: 'dark',
      geolocation: { longitude: 21.207, latitude: 45.7503, accuracy: 15 },
      permissions: ['geolocation'],
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__gpsRequests = 0;
      const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (...args) => {
        window.__gpsRequests++;
        return original(...args);
      };
    });
    const shot = async (name) => {
      if (!name.includes('loading')) await page.waitForTimeout(750);
      await page.addStyleTag({
        content:
          'body:after{content:"TEST · RUTE SINTETICE · NU DOVADĂ DE ACCES LA FURNIZOR";position:fixed;bottom:73px;left:8px;z-index:9999;background:#362c15;color:#ffe8a9;font:8px sans-serif;padding:5px;pointer-events:none}',
      });
      await page.screenshot({ path: `${output}/${name}.png` });
    };
    await page.goto(base);
    await page.waitForFunction(() => !!window.__vlaiqMap?.getSource('flow-county'));
    assert.equal(await page.evaluate(() => window.__gpsRequests), 0);
    await page.screenshot({ path: `${output}/01-empty-real-data-mobile.png` });
    await page.getByRole('combobox').fill('Victoriei');
    await page.getByRole('option').first().click();
    await page.getByRole('heading', { name: 'Un drum. Mai multe posibilități.' }).waitFor();
    // Parking first: the SmartMatch list comes before Smart Journey and needs no origin.
    await page.getByRole('heading', { name: 'Unde parchezi', exact: true }).waitFor();
    assert(
      await page.evaluate(() => {
        const parking = document.querySelector('.parking-panel');
        const journey = document.querySelector('.green-switch');
        return !!parking && !!journey && !!(parking.compareDocumentPosition(journey) & 4);
      }),
      'parking list is shown above Smart Journey',
    );
    await page.getByRole('button', { name: 'Detalii și traseu', exact: true }).first().waitFor();
    assert(
      (await page.getByRole('meter', { name: 'Șanse estimate de loc liber' }).count()) > 0,
      'cards show the estimated chance of a free space',
    );
    await page.screenshot({ path: `${output}/02-destination-no-origin.png` });
    // Parking preview without an origin: estimate, score and an explicit origin prompt, no error.
    await page.getByRole('button', { name: 'Detalii și traseu', exact: true }).first().click();
    await page.getByRole('heading', { name: /De ce e pe locul 1/ }).waitFor();
    await page.getByText(/Alege de unde pornești/).first().waitFor();
    assert.equal(await page.locator('article [role=alert]').count(), 0, 'no error without origin');
    await shot('03-parking-preview-no-origin');
    await page.getByRole('button', { name: 'Toate parcările', exact: true }).click();
    let requests = 0;
    let latestInput;
    await page.route('**/api/journeys/complete', async (route) => {
      requests++;
      latestInput = JSON.parse(route.request().postData());
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({ json: completeFixture(latestInput) });
    });
    await page.getByRole('button', { name: 'Locația mea', exact: true }).click();
    await shot('04-loading-test-fixture');
    await page.locator('.journey-option[data-category=cycle]').waitFor();
    assert.equal(
      await page.locator('.journey-option.selected').getAttribute('data-category'),
      'cycle',
    );
    const count = requests;
    await page.getByRole('button', { name: 'Cea mai rapidă', exact: true }).click();
    assert.equal(
      await page.locator('.journey-option.selected').getAttribute('data-category'),
      'car_park_walk',
    );
    await page.waitForFunction(
      () => window.__vlaiqMap.getSource('flow-complete-journey')?._data?.features.length === 2,
    );
    await page.locator('.journey-summary-heading').scrollIntoViewIfNeeded();
    // The chosen parking is visible without another tap: SmartMatch rank and the labelled estimate.
    const chosen = page.getByRole('region', { name: 'Parcarea aleasă' });
    await chosen.getByText('P1', { exact: true }).waitFor();
    await chosen.getByRole('meter', { name: 'Șanse estimate de loc liber' }).waitFor();
    await chosen.getByText(/Ocupare live: necunoscută/).waitFor();
    await shot('05-car-summary-mobile');
    await page.getByRole('button', { name: 'Detalii parcare', exact: true }).click();
    await page
      .getByRole('region', { name: 'Parcarea din călătorie' })
      .getByText(/Preț necunoscut/)
      .first()
      .waitFor();
    await shot('06-parking-unknowns');
    await page.locator('.journey-timeline button').filter({ hasText: 'Pe jos' }).click();
    await page.waitForFunction(
      () =>
        window.__vlaiqMap
          .getSource('flow-complete-journey')
          ._data.features.find((f) => f.properties.mode === 'walk').properties.emphasized === true,
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.__vlaiqMap
            .getSource('flow-complete-journey')
            ._data.features.find((f) => f.properties.mode === 'drive').properties.emphasized,
      ),
      false,
    );
    await shot('07-pedestrian-leg-focus');
    await page.getByRole('button', { name: 'Extinde planificatorul' }).click();
    await page.getByRole('button', { name: 'Mai ecologică', exact: true }).click();
    await page.waitForFunction(
      () =>
        window.__vlaiqMap.getSource('flow-complete-journey')._data.features[0]?.properties.mode ===
        'cycle',
    );
    await page.locator('.journey-option.selected').scrollIntoViewIfNeeded();
    await shot('08-cycle-green-switch');
    await page.locator('.journey-option[data-category=walk]').click();
    await page.waitForFunction(
      () =>
        window.__vlaiqMap.getSource('flow-complete-journey')._data.features[0]?.properties.mode ===
        'walk',
    );
    await page.locator('.journey-timeline').scrollIntoViewIfNeeded();
    await shot('09-walk-timeline');
    assert.equal(requests, count, 'preference/leg/route changes issue no fresh provider request');
    const mapIdentity = await page.evaluate(() => {
      window.__sameMap = window.__vlaiqMap;
      return true;
    });
    assert(mapIdentity);
    await page.getByRole('button', { name: 'Activează tema Mist Day' }).click();
    await page.waitForFunction(
      () =>
        window.__vlaiqMap.getSource('flow-complete-journey')?._data?.features[0]?.properties
          .mode === 'walk',
    );
    assert(
      await page.evaluate(() => window.__vlaiqMap === window.__sameMap),
      'theme does not recreate map',
    );
    await shot('10-light-theme-timeline');
    for (const width of [360, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
      await page.locator('.journey-summary-heading').scrollIntoViewIfNeeded();
      await page.waitForTimeout(750);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `overflow at ${width}`,
      );
      await shot(`11-responsive-${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(
      await page.locator('.selected-journey').evaluate((e) => getComputedStyle(e).animationName),
      'none',
    );
    assert(
      await page.evaluate(async () => {
        await document.fonts.ready;
        return (
          document.fonts.check('600 16px "Manrope Variable"', 'Timișoara') &&
          document.fonts.check('400 16px "Inter Variable"', 'ȘȚăîâ')
        );
      }),
    );
    await page.locator('.journey-option[data-category=cycle]').click();
    await page.getByRole('button', { name: 'Pornește această călătorie', exact: true }).click();
    await page.waitForURL('**/motion?mode=cycle');
    assert.equal(
      await page
        .getByRole('button', { name: 'Bicicletă', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.evaluate(() => window.__gpsRequests),
      1,
      'handoff does not start another GPS session',
    );
    await page.locator('.flow-journey-context').waitFor();
    await shot('12-motion-handoff');
    await page.getByRole('button', { name: 'Mers pe jos', exact: true }).click();
    assert.equal(
      await page.locator('.flow-journey-context').count(),
      0,
      'manual mode changes clear incompatible plans',
    );
    await page.getByRole('button', { name: /Deschide portofelul/ }).click();
    await page.getByText('Primul tău drum te așteaptă.', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Explorează', exact: true }).click();
    assert.equal(requests, count, 'internal tab navigation preserves calculation');
    await page.getByRole('button', { name: 'Pornește această călătorie', exact: true }).click();
    await page.waitForURL('**/motion?mode=cycle');
    assert.equal(
      await page
        .getByRole('button', { name: 'Bicicletă', exact: true })
        .getAttribute('aria-pressed'),
      'true',
      'a new handoff reapplies the planned mode after a manual change',
    );
    await page.getByRole('link', { name: 'Explorează', exact: true }).click();
    // A delayed earlier result must never overwrite a newer constraint request.
    await page.unroute('**/api/journeys/complete');
    let index = 0;
    await page.route('**/api/journeys/complete', async (r) => {
      const own = ++index;
      const input = JSON.parse(r.request().postData());
      latestInput = input;
      await new Promise((resolve) => setTimeout(resolve, own === 1 ? 800 : 30));
      const value = completeFixture(input);
      value.coverage = `LATEST_REQUEST_${own}`;
      await r.fulfill({ json: value }).catch(() => {});
    });
    // Parking settings live in "Unde parchezi" and are shared with the car journey.
    await page.getByRole('combobox', { name: /^Stai cât\?/ }).selectOption('60');
    await page.waitForTimeout(70);
    await page.getByRole('combobox', { name: /^Stai cât\?/ }).selectOption('180');
    await page.waitForTimeout(1000);
    assert.equal(latestInput.stayMinutes, 180, 'journey uses the shared parking stay');
    await page.getByText('Surse și limitele comparației', { exact: true }).click();
    await page.getByText('LATEST_REQUEST_2', { exact: true }).waitFor();
    assert.equal(await page.getByText('LATEST_REQUEST_1', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Cea mai rapidă', exact: true }).click();
    const navigationLink = page.getByRole('link', {
      name: 'Navighează până la parcare',
      exact: true,
    });
    const plannedOrigin = new URL(await navigationLink.getAttribute('href'), base).searchParams.get(
      'from',
    );
    await page.route('**/api/navigation/routes', async (r) => {
      const input = JSON.parse(r.request().postData());
      await r.fulfill({
        json: {
          routes: [
            {
              id: 'test-car-navigation',
              source: 'SYNTHETIC TEST FIXTURE',
              quality: 'estimated',
              duration: 300,
              distance: 1500,
              geometry: [input.origin, [input.origin[0], input.destination[1]], input.destination],
              steps: [
                { index: 0, type: 'depart', road: '' },
                { index: 2, type: 'arrive', road: '' },
              ],
            },
          ],
        },
      });
    });
    const routed = page.waitForResponse((r) => r.url().endsWith('/api/navigation/routes'));
    await navigationLink.click();
    const response = await routed;
    assert.deepEqual(
      JSON.parse(response.request().postData()).origin,
      plannedOrigin.split(',').map(Number),
      'car navigation preserves the explicit preview origin',
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: parking list before Smart Journey, parking preview without origin, shared parking settings; synthetic complete car/parking/walk with visible SmartMatch parking, active profiles, timeline/map emphasis, no extra preference requests, theme/style preservation, 360–1440 layouts, fonts, reduced motion, explicit GPS, Motion context, zero selection rewards and stale-response rejection.',
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
