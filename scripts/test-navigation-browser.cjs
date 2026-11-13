// Browser integration tests with synthetic fixtures, never application demo data.
// PLAYWRIGHT_MODULE can point to an existing Playwright installation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const output = process.env.NAV_TEST_OUTPUT || '/tmp/vlaiq-navigation-tests';
fs.mkdirSync(output, { recursive: true });
const routeFixture = {
  id: 'fixture-main',
  distance: 200,
  duration: 20,
  quality: 'estimated',
  source: 'SYNTHETIC TEST FIXTURE — not a real road route',
  geometry: [
    [21.206, 45.7503],
    [21.207, 45.7503],
    [21.207, 45.7513],
  ],
  steps: [
    { index: 0, type: 'depart', road: '' },
    { index: 1, type: 'turn', modifier: 'left', road: 'Stradă de test' },
    { index: 2, type: 'arrive', road: '' },
  ],
};
const alternative = { ...routeFixture, id: 'fixture-alt', duration: 30 };
const base = process.env.NAV_TEST_URL || 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const errors = [];
    const page = await context.newPage();
    await page.clock.install();
    page.on('pageerror', (e) => errors.push(e.message));
    let routeCalls = [];
    await page.route('**/api/navigation/routes', async (r) => {
      routeCalls.push(r.request().postDataJSON());
      await r.fulfill({ json: { routes: [routeFixture, alternative] } });
    });
    // Isolated blank test style: no fake roads/buildings rendered as real geography.
    await page.route('https://tiles.openfreemap.org/**', (r) =>
      r.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#28333f' } },
          ],
        },
      }),
    );
    // Observe the actual MapLibre instance only in this test's transformed module.
    await page.route('**/src/features/navigation/NavigationMap.tsx*', async (r) => {
      const response = await r.fetch();
      await r.fulfill({
        response,
        body: (await response.text()).replace(
          'map.current = m;',
          'map.current = m; window.__testMap = m;',
        ),
      });
    });
    await page.addInitScript(() => {
      window.__geo = { watched: 0, cleared: 0, mode: 'denied' };
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(success, error) {
            if (window.__geo.mode === 'denied') error({ code: 1 });
            else
              success({
                coords: {
                  longitude: 21.2055,
                  latitude: 45.7501,
                  accuracy: 8,
                  heading: null,
                  speed: null,
                },
                timestamp: Date.now(),
              });
          },
          watchPosition(success, error) {
            window.__geo.watched++;
            window.__geo.fix = success;
            window.__geo.fail = error;
            queueMicrotask(() => {
              if (window.__geo.mode === 'denied') error({ code: 1 });
              else
                success({
                  coords: {
                    longitude: 21.2055,
                    latitude: 45.7501,
                    accuracy: 8,
                    heading: null,
                    speed: null,
                  },
                  timestamp: Date.now(),
                });
            });
            return 42;
          },
          clearWatch() {
            window.__geo.cleared++;
            window.__geo.fix = null;
          },
        },
      });
    });
    await page.goto(`${base}/navigation`);
    await page.getByRole('button', { name: /Încearcă experiența DEMO/ }).waitFor();
    await page.waitForFunction(() => !!window.__testMap?.getSource('nav-upcoming'));
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      'no horizontal overflow',
    );
    await page.getByRole('button', { name: /Alternativa 1/ }).click();
    assert.equal(
      await page.getByRole('button', { name: /Alternativa 1/ }).getAttribute('aria-pressed'),
      'true',
    );
    await page.getByRole('button', { name: /Ruta principală/ }).click();
    await page.getByRole('button', { name: 'Start navigație' }).click();
    await page
      .getByRole('alert')
      .filter({ hasText: /refuzat|blocat/ })
      .waitFor();
    assert.equal(
      await page.locator('.nav-vehicle').count(),
      0,
      'denied GPS never creates a fake vehicle',
    );
    await page.getByRole('button', { name: /Încearcă experiența DEMO/ }).click();
    await page.getByRole('button', { name: 'Pauză demonstrație' }).waitFor();
    await page.waitForFunction(() => window.__testMap?.getPitch() > 40);
    const initialBearing = await page.evaluate(() => window.__testMap.getBearing());
    assert(Math.abs(initialBearing) > 20, 'camera follows route heading');
    await page.getByRole('button', { name: 'Pauză demonstrație' }).click();
    await page.waitForFunction(() => !window.__testMap.isMoving());
    const pausedMarker = await page.locator('.nav-vehicle').getAttribute('style');
    await page.waitForTimeout(500);
    assert.equal(
      await page.locator('.nav-vehicle').getAttribute('style'),
      pausedMarker,
      'pause stops demo movement',
    );
    await page.getByRole('button', { name: 'Nord în sus și perspectivă 2D' }).click();
    await page.waitForFunction(
      () => window.__testMap.getPitch() < 1 && Math.abs(window.__testMap.getBearing()) < 1,
    );
    assert(Math.abs(await page.evaluate(() => window.__testMap.getBearing())) < 1);
    await page.getByRole('button', { name: 'Activează perspectiva 3D' }).click();
    await page.waitForFunction(() => window.__testMap.getPitch() > 40);
    await page.evaluate(() => window.__testMap.fire('dragstart'));
    await page.getByRole('button', { name: 'Recentrează', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Recentrează', exact: true }).count(), 0);
    await page.addStyleTag({
      content:
        'body::after{content:"TEST UI · DATE SINTETICE";position:fixed;top:5px;right:5px;z-index:99999;background:#593b12;color:#ffe4b5;padding:5px;font:9px sans-serif}',
    });
    await page.screenshot({ path: `${output}/navigation-mobile-test-fixture.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${output}/navigation-desktop-test-fixture.png` });
    await page.getByRole('button', { name: 'Oprește navigația' }).click();
    await page.getByRole('button', { name: 'Start navigație' }).waitFor();
    await page.evaluate(() => {
      window.__geo.mode = 'granted';
    });
    await page.getByRole('button', { name: 'Start navigație' }).click();
    await page.waitForFunction(() => window.__geo.watched > 0);
    assert.deepEqual(
      routeCalls.at(-1).origin,
      [21.2055, 45.7501],
      'live route starts at browser GPS fix, not preview origin',
    );
    assert.equal(await page.locator('.mode-chip').innerText(), 'GPS LIVE');
    await page.evaluate(() =>
      window.__geo.fix({
        coords: { longitude: 21.2061, latitude: 45.7503, accuracy: 8, heading: 90, speed: 5 },
        timestamp: Date.now() + 1000,
      }),
    );
    await page.locator('.speedometer').filter({ hasText: '18' }).waitFor();
    await page.evaluate(() =>
      window.__geo.fix({
        coords: { longitude: 21.4, latitude: 45.8, accuracy: 200, heading: 0, speed: 40 },
        timestamp: Date.now() + 2000,
      }),
    );
    await page
      .getByRole('status')
      .filter({ hasText: /Semnal GPS slab/ })
      .waitFor();
    assert.equal(
      await page.locator('.speedometer strong').innerText(),
      '—',
      'unreliable GPS does not display a speed',
    );
    const beforeReroute = routeCalls.length;
    await page.evaluate(() => {
      for (let i = 0; i < 3; i++)
        window.__geo.fix({
          coords: {
            longitude: 21.21 + i * 0.0001,
            latitude: 45.753,
            accuracy: 8,
            heading: 90,
            speed: 5,
          },
          timestamp: Date.now() + 3000 + i * 1000,
        });
    });
    await page.getByRole('status').filter({ hasText: 'Ruta a fost actualizată' }).waitFor();
    assert.equal(routeCalls.length, beforeReroute + 1, 'three off-route fixes trigger one reroute');
    await page.evaluate(() => {
      for (let i = 0; i < 4; i++)
        window.__geo.fix({
          coords: {
            longitude: 21.212 + i * 0.0001,
            latitude: 45.754,
            accuracy: 8,
            heading: 90,
            speed: 5,
          },
          timestamp: Date.now() + 7000 + i * 1000,
        });
    });
    assert.equal(
      routeCalls.length,
      beforeReroute + 1,
      'reroute cooldown prevents repeated requests',
    );
    await page.getByRole('button', { name: 'Oprește navigația' }).click();
    assert(
      await page.evaluate(() => window.__geo.cleared > 0),
      'watchPosition is cleaned up on exit',
    );
    assert.equal(await page.locator('.nav-vehicle').count(), 0);
    await page.getByRole('button', { name: /Încearcă experiența DEMO/ }).click();
    await page.getByRole('button', { name: 'Repornește demonstrația' }).click();
    await page.clock.runFor(22000);
    await page.getByText('Ai ajuns', { exact: true }).waitFor();
    assert.equal(
      await page.locator('.trip-metric').nth(2).locator('strong').innerText(),
      '0 m',
      'demo finishes at zero remaining distance',
    );
    assert.equal(await page.getByRole('button', { name: 'Pauză demonstrație' }).isDisabled(), true);
    assert.deepEqual(errors, [], 'no uncaught browser exceptions');
    console.log(
      'PASS: alternatives, permission denial, demo pause/restart/arrival, 3D/bearing, 2D north-up, detach/recenter, GPS origin/speed/accuracy, rerouting/cooldown, watcher cleanup, mobile layout.',
    );
    console.log(`Screenshots (synthetic test fixtures): ${output}`);
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
