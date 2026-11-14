// UI regressions with explicit synthetic routing. No evidence of real provider access.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.NAV_TEST_URL || 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(15000);
    const errors = [], requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let failed = true;
    await page.route('**/api/navigation/routes', async (intercepted) => {
      const input = intercepted.request().postDataJSON();
      requests.push(input);
      if (failed) return intercepted.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'TEST: furnizor indisponibil' } } });
      await intercepted.fulfill({ json: { routes: [{
        id: 'reliability-fixture', distance: 200, duration: 20, quality: 'estimated',
        source: 'SYNTHETIC UI TEST FIXTURE',
        geometry: [input.origin, [input.origin[0], input.destination[1]], input.destination],
        steps: [{ index: 0, type: 'depart', road: '' }, { index: 2, type: 'arrive', road: '' }],
      }] } });
    });
    const query = new URLSearchParams({
      from: '21.206,45.7503', fromName: 'TEST origin', to: '21.207,45.7513', name: 'TEST parking A',
      chance: '0.5', walk: '3', alt: '21.208,45.752', altName: 'TEST parking B',
      altChance: '0.7', altWalk: '5', final: '21.2258,45.7525', finalName: 'TEST destination',
    });
    await page.goto(`${base}/navigation?${query}`);
    await page.getByRole('alert').filter({ hasText: 'TEST: furnizor indisponibil' }).waitFor();
    assert.equal(await page.locator('.nav-vehicle').count(), 0, 'failed provider never creates movement');
    failed = false;
    await page.reload();
    await page.getByRole('button', { name: /Încearcă experiența DEMO/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Pauză demonstrație' }).click();
    const before = requests.length;
    const trigger = page.getByRole('button', { name: 'Simulează: parcarea s-a umplut', exact: true });
    const offer = page.getByRole('alert', { name: 'Parcarea s-a umplut', exact: true });
    await trigger.click();
    await offer.waitFor();
    assert.match(await offer.innerText(), /SIMULARE/);
    assert.match(await offer.innerText(), /70%/);
    await offer.getByRole('button', { name: /Rămân pe ruta actuală/ }).click();
    assert.equal(await offer.count(), 0);
    assert.equal(requests.length, before, 'keeping the parking never reroutes');
    await trigger.click();
    await offer.waitFor({ state: 'hidden', timeout: 18000 });
    assert.equal(requests.length, before, 'offer expiry keeps the current route');
    await trigger.click();
    const switched = page.waitForResponse((response) => response.url().endsWith('/api/navigation/routes'));
    await offer.getByRole('button', { name: 'Schimbă spre TEST parking B', exact: true }).click();
    assert.equal((await switched).status(), 200);
    await page.waitForFunction(() => document.body.innerText.includes('TEST parking B'));
    await page.getByRole('button', { name: 'Oprește demonstrația și revino la ruta inițială' }).waitFor();
    assert.equal(requests.length, before + 1, 'accepting the alternative calculates exactly one route');
    assert.deepEqual(requests.at(-1).destination, [21.208, 45.752]);
    assert.notDeepEqual(requests.at(-1).origin, [21.206, 45.7503], 'switch starts at the moved simulated position');
    await page.getByRole('button', { name: 'Oprește navigația' }).click();
    await page.getByRole('button', { name: 'Start navigație' }).waitFor();
    assert.equal(await page.locator('.nav-vehicle').count(), 0, 'exit cleans up simulated movement');
    assert.deepEqual(errors, []);
    console.log('PASS: provider 503 state, no fabricated vehicle, recovery, DEMO parking-full keep/15s expiry/accepted reroute, source handoff metrics, exactly one switch request, simulated origin and exit cleanup. Synthetic UI fixtures only.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
