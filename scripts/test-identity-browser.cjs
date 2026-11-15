// Browser contract + real PostgreSQL handlers with a SYNTHETIC Auth0 SDK/local RS256 issuer.
// Does not prove Google, Auth0 callbacks/token exchange, email, Passkey, MFA or live voice.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'),
  fs = require('node:fs');
const accounts = JSON.parse(
  fs.readFileSync(
    process.env.IDENTITY_FIXTURE_FILE || '/tmp/flow-identity-browser-fixture.json',
    'utf8',
  ),
);
const base = process.env.IDENTITY_TEST_URL || 'http://localhost:5173';
const evidence = process.env.IDENTITY_EVIDENCE_DIR || '/tmp/flow-identity-browser';
fs.mkdirSync(evidence, { recursive: true });
(async () => {
  for (const account of accounts) {
    const reset = await fetch('http://127.0.0.1:8790/api/me', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    assert.equal(reset.status, 200, 'Disposable fixture reset');
  }
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
    }, accounts[0]);
    await context.route(/\/node_modules\/\.vite\/deps\/@auth0_auth0-react\.js/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: "export {Auth0Provider,useAuth0} from '/identity-auth0-mock.tsx';",
      }),
    );
    await context.route(/\/api\/(me|motion|team)(\/|$|\?)/, async (route) => {
      const url = new URL(route.request().url());
      url.host = '127.0.0.1:8790';
      await route.fulfill({
        response: await route.fetch({ url: url.toString() }),
      });
    });
    const page = await context.newPage(),
      errors = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('requestfailed', (r) => {
      if (r.url().includes('/api/me'))
        console.log('Account request failed:', r.failure()?.errorText);
    });
    page.on('response', (r) => {
      if (r.url().includes('/api/me') && r.status() >= 400) console.log('Account HTTP', r.status());
    });
    await page.goto(base + '/profile');
    await page.getByRole('heading', { name: 'Călător FLOW', exact: true }).waitFor();
    await page.getByText('Prima călătorie începe cu tine.').waitFor();
    await page.getByRole('link', { name: 'Editează profilul', exact: true }).click();
    await page.getByLabel('Nume afișat', { exact: true }).fill('Alex · Călător urban');
    await page.getByLabel('Nickname', { exact: true }).fill('Alex');
    await page.getByLabel('Biografie', { exact: false }).fill('Orașul se descoperă pas cu pas.');
    await page.getByLabel('Prioritate în SmartMatch').selectOption('cheap');
    await page.getByLabel('Maximum minute de mers pe jos').fill('8');
    await page.getByRole('button', { name: 'Salvează modificările' }).click();
    await page.getByRole('status').filter({ hasText: 'Profil salvat' }).waitFor();
    assert.match(await page.locator('.identity-account-trigger').innerText(), /Alex/);
    await page.getByRole('button', { name: 'Deschide autentificarea Auth0', exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.identityFixture.login.authorizationParams.prompt),
      'login',
    );
    await page.reload();
    await page.getByLabel('Nickname', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Nickname', { exact: true }).inputValue(), 'Alex');
    assert.equal(await page.getByLabel('Maximum minute de mers pe jos').inputValue(), '8');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
      'base64',
    );
    // Generated image fixture via browser canvas, not a real person's photograph.
    const bytes = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 600;
      c.height = 400;
      const x = c.getContext('2d');
      x.fillStyle = '#167d50';
      x.fillRect(0, 0, 600, 400);
      x.fillStyle = '#e6f2e2';
      x.fillRect(80, 60, 180, 220);
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.getByLabel('Alege fotografia', { exact: true }).setInputFiles({
      name: 'synthetic-avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from(bytes, 'base64'),
    });
    await page.getByRole('dialog').waitFor();
    console.log('Avatar crop dialog opened');
    await page.getByLabel('Zoom fotografie').fill('1.5');
    await page.getByLabel('Poziție orizontală').fill('0.25');
    await page.getByRole('button', { name: 'Salvează fotografia', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.locator('.identity-account-trigger img').waitFor();
    await page.reload();
    await page.locator('.identity-account-trigger img').waitFor();
    console.log(
      'Profile, nickname, biography, preferences and cropped avatar persist across reload: PASS (local RS256 + PostgreSQL)',
    );
    await page.getByLabel('Nickname', { exact: true }).fill('Unsaved');
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('link', { name: 'Înapoi la pașaport', exact: false }).click();
    assert.match(page.url(), /profile\/edit/);
    await page.getByLabel('Nickname', { exact: true }).fill('Alex');
    await page.goto(base + '/profile');
    await page.getByRole('heading', { name: 'Alex · Călător urban', exact: true }).waitFor();
    await page.locator('.identity-account-trigger').click();
    await page.getByRole('menuitem', { name: 'Profilul meu', exact: true }).waitFor();
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Deconectare');
    await page.keyboard.press('Escape');
    assert.equal(
      await page.locator('.identity-account-trigger').evaluate((e) => e === document.activeElement),
      true,
    );
    for (const theme of ['light', 'dark'])
      for (const width of [320, 390, 768, 1440]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
          false,
          `${theme} profile overflow at ${width}`,
        );
        if ([320, 390].includes(width)) {
          await page.locator('.identity-account-trigger').click();
          const box = await page.locator('.identity-dropdown').boundingBox();
          assert.ok(
            box && box.x >= 0 && box.x + box.width <= width,
            'Mobile account menu stays in viewport',
          );
          await page.keyboard.press('Escape');
        }
        if ([390, 1440].includes(width))
          await page.screenshot({
            path: `${evidence}/passport-${theme}-${width}.png`,
            fullPage: true,
          });
      }
    await page.evaluate(() => window.identityFixture.callback('/profile?view=activity#timeline'));
    assert.equal(new URL(page.url()).search, '?view=activity');
    assert.equal(new URL(page.url()).hash, '#timeline');
    await page.evaluate(() => window.identityFixture.callback('https://evil.invalid/'));
    assert.equal(new URL(page.url()).pathname, '/profile');
    // An invalid actual API token expires the private session and remounts the gateway.
    await page.evaluate(() =>
      window.identityFixture.switchAccount({ subject: 'auth0|invalid-token', token: 'invalid' }),
    );
    await page.getByRole('heading', { name: 'Continuă în FLOW.' }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Alex · Călător urban', exact: true }).waitFor();
    // Changing the SDK identity remounts private UI; the second account sees its own database row.
    await page.evaluate((account) => window.identityFixture.switchAccount(account), accounts[1]);
    await page.getByRole('heading', { name: 'Călător FLOW', exact: true }).waitFor();
    assert.equal(await page.locator('.identity-account-trigger img').count(), 0);
    assert.equal(
      await page.getByText('Orașul se descoperă pas cu pas.', { exact: true }).count(),
      0,
    );
    await page.goto(base + '/team');
    await page
      .getByRole('heading', {
        name: 'Un oraș mai ușor de traversat.',
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page
        .getByRole('button', {
          name: 'Editează prezentarea echipei',
          exact: true,
        })
        .count(),
      0,
    );
    await page.evaluate((account) => window.identityFixture.switchAccount(account), accounts[2]);
    await page
      .getByRole('button', {
        name: 'Editează prezentarea echipei',
        exact: true,
      })
      .waitFor();
    await page
      .getByRole('button', {
        name: 'Editează prezentarea echipei',
        exact: true,
      })
      .click();
    await page.getByLabel('Titlu', { exact: true }).fill('Un oraș mai ușor de traversat.');
    await page.getByRole('button', { name: 'Salvează prezentarea', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Prezentare salvată' }).waitFor();
    await page.screenshot({
      path: `${evidence}/team-desktop.png`,
      fullPage: true,
    });
    await page.goto(base + '/profile');
    await page.locator('.identity-account-trigger').click();
    await page.getByRole('menuitem', { name: 'Deconectare', exact: true }).click();
    await page.getByRole('heading', { name: 'Continuă în FLOW.' }).waitFor();
    assert.equal(await page.evaluate(() => window.identityFixture.loggedOut), true);
    await page.getByRole('button', { name: 'Creează cont', exact: true }).click();
    assert.equal(
      await page.evaluate(() => window.identityFixture.login.authorizationParams.screen_hint),
      'signup',
    );
    console.log(
      'Unsaved edits, menu keyboard/focus, account switch, RBAC UI, logout, signup, mobile/light/dark overflow: PASS',
    );
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
