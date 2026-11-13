// Browser GPS below is controlled test input. This is not a physical walk test.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.NAV_TEST_URL || 'http://localhost:5173';
const output = process.env.MOTION_TEST_OUTPUT || '/tmp/vlaiq-motion-tests';
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let latestId;
    page.on('response', async (response) => {
      if (response.url().endsWith('/api/motion/start') && response.ok())
        latestId = (await response.json()).id;
    });
    await page.addInitScript(() => {
      window.__motionGPS = { denied: true, cleared: 0, watching: 0 };
      Object.defineProperty(window, 'DeviceMotionEvent', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'geolocation', {
        value: {
          getCurrentPosition(success, error) {
            if (window.__motionGPS.denied) error({ code: 1 });
            else
              success({
                coords: { latitude: 45.75, longitude: 21.22, accuracy: 4 },
                timestamp: Date.now(),
              });
          },
          watchPosition(success) {
            window.__motionGPS.fix = success;
            window.__motionGPS.watching++;
            return 7;
          },
          clearWatch() {
            window.__motionGPS.fix = null;
            window.__motionGPS.cleared++;
          },
        },
        configurable: true,
      });
    });
    await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/motion/wallet') && r.ok()),
      page.goto(`${base}/motion`),
    ]);
    await page.getByRole('button', { name: 'Începe activitatea', exact: false }).waitFor();
    for (const width of [360, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: width > 1000 ? 1050 : 844 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        `no overflow at ${width}px`,
      );
      await page.screenshot({ path: `${output}/home-${width}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /Deschide portofelul/ }).click();
    await page.getByText('Primul tău drum te așteaptă.', { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/wallet-empty.png` });
    await page.getByRole('link', { name: 'Mișcare', exact: true }).click();
    await page.getByRole('button', { name: /Începe activitatea/ }).click();
    await page
      .getByRole('alert')
      .filter({ hasText: /refuzată/ })
      .waitFor();
    await page.evaluate(() => {
      window.__motionGPS.denied = false;
    });
    await page.getByRole('button', { name: /Începe activitatea/ }).click();
    await page.waitForFunction(() => !!window.__motionGPS.fix);
    await page.getByRole('button', { name: 'Activează senzorii opționali' }).click();
    await page.getByText('Senzori indisponibili · GPS suficient', { exact: true }).waitFor();
    await page.evaluate(() =>
      window.__motionGPS.fix({
        coords: { latitude: 45.75, longitude: 21.22, accuracy: 4 },
        timestamp: Date.now(),
      }),
    );
    await page.getByRole('button', { name: 'Încheie activitatea' }).click();
    await page.getByRole('region', { name: 'Rezultatul activității' }).waitFor();
    assert.equal(await page.locator('.motion-reward-number').innerText(), '+0\nFLOW Coins');
    const duplicate = await page.request.post(`${base}/api/motion/finish`, {
      data: { id: latestId, points: [] },
    });
    assert.equal(duplicate.status(), 200);
    assert.equal((await duplicate.json()).wallet.balance, 0);
    const tampered = await page.request.post(`${base}/api/motion/finish`, {
      data: { id: latestId, points: [], coins: 9999 },
    });
    assert.equal(tampered.status(), 400);
    await page.getByRole('button', { name: 'Vezi portofelul' }).click();
    assert.equal(
      await page.getByRole('button', { name: 'Deschide portofelul, 0 FLOW Coins' }).count(),
      1,
    );
    await page.getByRole('link', { name: 'Mișcare', exact: true }).click();
    await page.getByRole('button', { name: /Explorează experiența DEMO/ }).click();
    await page.waitForTimeout(6500);
    await page.getByRole('button', { name: 'Pauză', exact: true }).click();
    const paused = await page.locator('.activity-ring strong').innerText();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.activity-ring strong').innerText(), paused);
    await page.getByRole('button', { name: 'Continuă', exact: true }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Încheie activitatea' }).click();
    await page.getByRole('region', { name: 'Rezultatul activității' }).waitFor();
    assert.match(await page.locator('.motion-reward-number').innerText(), /^\+(10|15)/);
    await page.screenshot({ path: `output/demo-reward.png`.replace('output', output) });
    await page.getByRole('button', { name: 'Vezi portofelul' }).click();
    await page.getByText('DEMO separat', { exact: false }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Deschide portofelul, 0 FLOW Coins' }).count(),
      1,
      'demo never enters server wallet',
    );
    assert.equal((await (await page.request.get(`${base}/api/motion/wallet`)).json()).balance, 0);
    await page.getByRole('link', { name: 'Comunitate', exact: true }).click();
    await page.getByRole('button', { name: /Participă la previzualizarea locală/ }).click();
    assert.match(await page.locator('.league-own-row>strong').innerText(), /^0/);
    await page.getByRole('button', { name: /Retrage participarea/ }).click();
    await page.getByRole('link', { name: 'Mișcare', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(
      await page.locator('.hero-coin svg').evaluate((el) => getComputedStyle(el).animationName),
      'none',
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    if (process.env.MOTION_LIVE_TEST === '1') {
      console.log(
        'Recording ~100 seconds of mocked GPS against the real server clock (not physical-device validation).',
      );
      await page.getByRole('button', { name: /Începe activitatea/ }).click();
      await page.waitForFunction(() => !!window.__motionGPS.fix);
      for (let i = 0; i < 25; i++) {
        await page.evaluate(
          (i) =>
            window.__motionGPS.fix({
              coords: { latitude: 45.75 + (i * 9) / 111195, longitude: 21.22, accuracy: 4 },
              timestamp: Date.now(),
            }),
          i,
        );
        if (i < 24) await page.waitForTimeout(4100);
      }
      await page.getByRole('button', { name: 'Încheie activitatea' }).click();
      await page.getByRole('region', { name: 'Rezultatul activității' }).waitFor();
      assert.match(await page.locator('.motion-reward-number').innerText(), /^\+10/);
      await page.getByRole('button', { name: 'Vezi portofelul' }).click();
      await page.getByRole('button', { name: 'Deschide portofelul, 10 FLOW Coins' }).waitFor();
      const duplicate = await page.request.post(`${base}/api/motion/finish`, {
        data: { id: latestId, points: [] },
      });
      assert.equal((await duplicate.json()).wallet.balance, 10);
      await page.screenshot({ path: `${output}/wallet-server-award-test-gps.png` });
      console.log(
        'PASS: real server-clock GPS-input test awarded 10 coins once; duplicate did not award again.',
      );
    }
    assert.deepEqual(errors, []);
    assert(await page.evaluate(() => window.__motionGPS.cleared > 0));
    console.log(
      'PASS: responsive 360/390/430/768/1440, wallet empty state, denied GPS, missing sensors, zero reward stationary/short session, idempotency, reward tampering rejection, separate demo wallet, pause/resume, opt-in local league, reduced motion, cleanup.',
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
