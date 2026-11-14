// Session lifecycle integration with an explicitly mocked SDK + synthetic conversation token.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.VOICE_TEST_URL || 'http://localhost:5173';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] }); });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', (e) => { errors.push(e.message); console.error('PAGE ERROR', e.message); });
    await page.route('**/node_modules/.vite/deps/@elevenlabs_react.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: "export * from '/flow-voice-sdk-mock.tsx';" }));
    let tokens = 0;
    await page.route('**/api/flow-voice/session', (r) => { tokens++; return r.fulfill({ json: { conversationToken: 'SYNTHETIC_TEST_TOKEN', agentVersion: 'agtvrsn_7001m7dwanv7fe385wxb8f4zbc6c' } }); });
    await page.route('https://tiles.openfreemap.org/**', (r) => r.fulfill({ json: { version: 8, sources: {}, layers: [] } }));
    await page.goto(base);
    const card = page.locator('.flow-voice');
    await page.getByRole('button', { name: 'Pornește FLOW Voice' }).click();
    await page.waitForFunction(() => window.sdkMock?.starts === 1);
    await card.getByRole('status').filter({ hasText: 'Ascultă' }).waitFor();
    assert.equal(tokens, 1);
    await page.getByRole('button', { name: 'Oprește microfonul FLOW Voice' }).click();
    await card.getByRole('status').filter({ hasText: 'Microfon oprit' }).waitFor();
    await page.getByRole('button', { name: 'Oprește redarea copilotului' }).click();
    assert.deepEqual(await page.evaluate(() => window.sdkMock.volumes), [0]);
    assert.deepEqual(await page.evaluate(() => window.sdkMock.microphones), [true]);
    await page.getByRole('button', { name: 'Activează redarea copilotului' }).click();
    assert.deepEqual(await page.evaluate(() => window.sdkMock.volumes), [0, 1]);
    await page.evaluate(() => window.sdkMock.speak());
    await card.getByRole('status').filter({ hasText: 'Vorbește' }).waitFor();
    const oldHandler = await page.evaluate(async () => {
      window.oldTools = window.sdkMock.options.clientTools;
      return JSON.parse(await window.oldTools.get_journey_context({}));
    });
    assert.equal(oldHandler.ok, true);
    await page.getByRole('button', { name: 'Oprește FLOW Voice' }).click();
    await page.getByRole('button', { name: 'Pornește FLOW Voice' }).waitFor();
    assert.equal(await page.evaluate(() => window.sdkMock.ends), 1);
    assert.equal(await page.evaluate(async () => JSON.parse(await window.oldTools.update_journey_preferences({ priority: 'cheapest' })).error.code), 'STALE_CONTEXT');
    const state = await page.evaluate(() => ({ local: Object.values(localStorage), session: Object.values(sessionStorage) }));
    assert(!JSON.stringify(state).includes('SYNTHETIC_TEST_TOKEN'));
    await page.getByRole('button', { name: 'Pornește FLOW Voice' }).click();
    await page.waitForFunction(() => window.sdkMock.starts === 2);
    await card.getByRole('status').filter({ hasText: 'Ascultă' }).waitFor();
    assert.equal(await page.evaluate(async () => JSON.parse(await window.oldTools.update_journey_preferences({ priority: 'cheapest' })).error.code), 'STALE_CONTEXT');
    await page.getByRole('button', { name: 'Deschide meniul aplicației' }).click(); await page.locator('a[href="/help"]').click();
    await page.waitForFunction(() => window.sdkMock.ends === 2);
    assert.deepEqual(errors, []);
    console.log('PASS: MOCK SDK/session token — single connection, listening/speaking, independent microphone/output mute, stop/restart, stale tools, no token persistence and route cleanup. No live WebRTC/audio claim.');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
