// Integrated product QA. Active routes below are explicit synthetic test fixtures.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { completeFixture } = require('./lib/smart-journey-fixture.cjs');
const fs = require('node:fs');
const base = process.env.NAV_TEST_URL || 'http://localhost:5173';
const output = process.env.PREMIUM_TEST_OUTPUT || '/tmp/vlaiq-premium-tests';
fs.mkdirSync(output, { recursive: true });
const route = {
  id: 'test-geometry',
  distance: 1400,
  duration: 480,
  quality: 'estimated',
  source: 'SYNTHETIC TEST FIXTURE',
  geometry: [
    [21.206, 45.7503],
    [21.215, 45.75],
    [21.225, 45.753],
  ],
  steps: [
    { index: 0, type: 'depart', road: '' },
    { index: 2, type: 'arrive', road: '' },
  ],
};
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: 'light',
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__locationRequests = 0;
      const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (...args) => {
        window.__locationRequests++;
        return original(...args);
      };
    });
    await page.goto(base);
    await page.waitForFunction(() => !!window.__vlaiqMap?.getSource('flow-county'));
    assert.equal(
      await page.evaluate(() => window.__locationRequests),
      0,
      'GPS permission is never requested at launch',
    );
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await page.locator('.flow-nav>a').count(), 4, 'four primary navigation entries');
    await page.getByRole('button', { name: 'Activează tema Forest Night' }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.reload();
    await page.waitForFunction(() => !!window.__vlaiqMap?.getSource('flow-county'));
    assert.equal(
      await page.locator('html').getAttribute('data-theme'),
      'dark',
      'theme survives refresh',
    );
    await page.getByRole('button', { name: 'Vezi județul Timiș' }).click();
    await page.waitForTimeout(900);
    assert(
      (await page.evaluate(() => window.__vlaiqMap.getZoom())) < 10,
      'county fit shows actual county',
    );
    await page.evaluate(() => window.__vlaiqMap.jumpTo({ center: [21.2257, 45.7537], zoom: 14 }));
    for (const width of [360, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
      await page.waitForTimeout(150);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `Explore overflow ${width}`,
      );
      await page.screenshot({ path: `${output}/explore-dark-${width}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('combobox').fill('Victoriei');
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: 'Vezi traseul', exact: true }).first().waitFor();
    assert.match(
      await page.locator('.explore-origin>strong').innerText(),
      /Alege/,
      'no implicit demo origin',
    );
    assert.equal(await page.evaluate(() => window.__locationRequests), 0);
    await page.screenshot({ path: `${output}/parking-real-data-mobile.png` });
    let journeyRequests = 0;
    await page.route('**/api/journeys/complete', async (intercepted) => {
      journeyRequests++;
      await intercepted.fulfill({
        json: completeFixture(JSON.parse(intercepted.request().postData())),
      });
    });
    await page.getByRole('button', { name: 'Alege pe hartă', exact: true }).click();
    await page
      .locator('.explore-screen .maplibregl-canvas')
      .click({ position: { x: 195, y: 250 } });
    await page.getByRole('button', { name: /Cu bicicleta.*estimat/ }).waitFor();
    assert.equal(await page.locator('.explore-origin>strong').innerText(), 'Punct ales pe hartă');
    const calls = journeyRequests;
    await page.getByRole('button', { name: 'Cea mai rapidă', exact: true }).click();
    await page.getByRole('button', { name: 'Mai ecologică', exact: true }).click();
    assert.equal(journeyRequests, calls, 'preference switches do not call providers again');
    await page.addStyleTag({
      content:
        'body:after{content:"TEST GREEN SWITCH · DATE DE RUTARE SINTETICE";position:fixed;bottom:75px;left:15px;z-index:9999;font:8px sans-serif;background:#59411e;color:#ffe3a1;padding:5px;pointer-events:none}',
    });
    await page.screenshot({ path: `${output}/green-switch-test-fixture.png` });
    await page.getByRole('button', { name: 'Pornește această călătorie', exact: true }).click();
    await page.waitForURL('**/motion?mode=cycle');
    await page.getByRole('button', { name: 'Bicicletă', exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole('button', { name: 'Bicicletă', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.evaluate(() => window.__locationRequests),
      0,
      'selecting green travel never starts GPS or grants reward',
    );
    assert.equal(await page.locator('.motion-header').count(), 0, 'no duplicated Motion header');
    assert.equal(await page.locator('.motion-nav').count(), 0, 'no duplicated Motion navigation');
    await page.getByRole('button', { name: /Explorează experiența DEMO/ }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /Deschide portofelul/ }).click();
    await page.waitForURL('**/wallet');
    await page.getByRole('button', { name: 'Revino la activitate' }).waitFor();
    await page.getByRole('button', { name: 'Revino la activitate' }).click();
    await page.waitForURL('**/motion');
    assert.match(
      await page.locator('.activity-ring strong').innerText(),
      /[1-9]/,
      'recording state survives wallet route',
    );
    await page.getByRole('link', { name: 'Explorează', exact: true }).click();
    await page.getByRole('button', { name: /Activitate în curs/ }).waitFor();
    await page.getByRole('button', { name: /Activitate în curs/ }).click();
    await page.getByRole('button', { name: 'Anulează fără recompense' }).click();
    await page.getByRole('button', { name: /Deschide portofelul/ }).click();
    await page.getByText('Primul tău drum te așteaptă.', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Provocări', exact: true }).click();
    await page.getByRole('heading', { name: 'Fă loc mișcării.', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Comunitate', exact: true }).click();
    await page.getByRole('button', { name: /Participă la previzualizarea locală/ }).waitFor();
    await page.getByRole('button', { name: 'Deschide meniul aplicației' }).click();
    await page.getByRole('link', { name: /Pentru Primărie/ }).click();
    await page.waitForURL('**/city');
    await page
      .getByRole('heading', { name: /FLOW City|decizii|Date|Oraș|oraș/ })
      .first()
      .waitFor();
    await page.screenshot({ path: `${output}/city-dark-mobile.png` });
    await page.getByRole('button', { name: 'Deschide meniul aplicației' }).click();
    await page.getByRole('link', { name: /De unde provin datele/ }).click();
    await page.waitForURL('**/data');
    await page.screenshot({ path: `${output}/data-trust-dark-mobile.png` });
    await page.getByRole('button', { name: 'Activează tema Mist Day' }).click();
    await page.getByRole('link', { name: 'Mișcare', exact: true }).click();
    await page.getByRole('button', { name: /Începe activitatea/ }).waitFor();
    await page.screenshot({ path: `${output}/motion-light-mobile.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(
      await page.locator('.hero-coin svg').evaluate((e) => getComputedStyle(e).animationName),
      'none',
    );
    await page.goto(`${base}/missing-page`);
    await page.getByRole('heading', { name: 'Drumul acesta nu duce nicăieri.' }).waitFor();
    await page.getByRole('link', { name: /Înapoi la explorare/ }).click();
    await page.getByRole('combobox').waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'PASS: unified routing/4-tabs, theme persistence, real county map/fallback, responsive widths, actual municipal search/parking, explicit origin, GreenSwitch fixture-to-Motion handoff, active-session preservation, wallet/demo isolation, City/Data views, reduced motion, unknown-route recovery.',
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
