const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const exceptions = [];
    page.on('pageerror', (error) => exceptions.push(error.message));
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        if (type.startsWith('webgl') || type === 'experimental-webgl') return null;
        return original.call(this, type, ...args);
      };
    });
    let navigationModuleRequested = false;
    page.on('request', (request) => {
      if (request.url().includes('/NavigationScreen.tsx')) navigationModuleRequested = true;
    });
    await page.goto((process.env.NAV_TEST_URL || 'http://localhost:5173') + '/');
    await page.getByRole('heading', { name: 'Harta este temporar indisponibilă' }).waitFor();
    await page.getByRole('button', { name: 'Unde vrei să ajungi?', exact: true }).waitFor();
    assert.equal(
      navigationModuleRequested,
      false,
      'Explore does not depend on loading the navigation module',
    );
    await page.getByRole('button', { name: 'Reîncarcă harta' }).click();
    await page.getByRole('heading', { name: 'Harta este temporar indisponibilă' }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(exceptions, [], 'failed WebGL must not unmount React');
    await page.getByRole('button', { name: 'Deschide meniul aplicației' }).click();
    await page.getByRole('link', { name: /Navigație 3D/ }).click();
    await page
      .getByRole('heading', { name: 'Nu am putut încărca aplicația' })
      .count()
      .then((n) => assert.equal(n, 0));
    await page.getByRole('button', { name: 'Start navigație' }).waitFor();
    assert.deepEqual(exceptions, []);
    console.log(
      'PASS: unavailable WebGL keeps home page, planning action and navigation link functional; retry and mobile layout work; navigation loads independently.',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
