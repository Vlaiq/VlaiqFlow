// Run after pnpm build with NODE_ENV=production API_PORT=8887 pnpm -F backend start.
// This tests the compiled app and offline DEMO, not physical-device GPS.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.PRODUCTION_TEST_URL || 'http://localhost:8887';

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);await page.getByRole('combobox').waitFor();
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    await page.goto(`${base}/data`);await page.locator('.data-trust-page').waitFor();
    const entries=await page.evaluate(async()=>{const names=await caches.keys();return(await Promise.all(names.map(async name=>(await(await caches.open(name)).keys()).map(r=>new URL(r.url).pathname)))).flat();});
    assert(entries.length>10);assert(!entries.some(path=>path.startsWith('/api')));
    console.log(`Public cache entries: ${entries.length}; API cache entries: 0.`);
    await context.setOffline(true);await page.goto(`${base}/motion`);
    await page.getByRole('button',{name:/Explorează experiența DEMO/}).waitFor();
    await page.getByRole('alert').filter({hasText:/Nu putem contacta Motion/}).waitFor();
    await page.getByRole('button',{name:/Explorează experiența DEMO/}).click();
    await page.waitForTimeout(7000);await page.getByRole('button',{name:'Încheie activitatea'}).click();
    await page.getByRole('region',{name:'Rezultatul activității'}).waitFor();
    assert.match(await page.locator('.motion-reward-number').innerText(),/^\+10/);
    assert.deepEqual(errors,[]);
    console.log('PASS: compiled same-origin app, deep-link refresh, public-only cache, Romanian offline error, offline Motion DEMO, no uncaught exceptions.');
    await context.close();
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
