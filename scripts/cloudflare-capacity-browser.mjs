// Small anonymous production sample, not a load test. No account/financial writes.
import { chromium } from '@playwright/test';
import { productUrl } from '../react-app/src/lib/commerce.js';
const origin = 'https://glamiastore.com';
const catalogue = await (await fetch(origin + '/api/products?view=cards&limit=10&page=1')).json();
const products = (catalogue.products || []).slice(0,3).map(productUrl);
const browser = await chromium.launch();
try {
  for (const width of process.argv.includes('--mobile-only') ? [390] : [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    const records = new Map();
    const suppressed = [];
    await cdp.send('Fetch.enable', { patterns: ['/api/analytics/track','/api/coupons/available','/cdn-cgi/rum'].map(path => ({ urlPattern: origin + path + '*', requestStage: 'Request' })) });
    cdp.on('Fetch.requestPaused', async event => {
      suppressed.push(new URL(event.request.url).pathname);
      await cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Aborted' }).catch(() => {});
    });
    cdp.on('Network.requestWillBeSent', event => {
      const url = new URL(event.request.url);
      if (url.origin === origin && !url.pathname.startsWith('/cdn-cgi/')) records.set(event.requestId, { path: url.pathname, method: event.request.method, cached: false, failed: false });
    });
    cdp.on('Network.requestServedFromCache', event => { const record = records.get(event.requestId); if (record) record.cached = true; });
    cdp.on('Network.responseReceived', event => { const record = records.get(event.requestId); if (record) { record.status = event.response.status; record.cached ||= event.response.fromDiskCache || event.response.fromServiceWorker; } });
    cdp.on('Network.loadingFailed', event => { const record = records.get(event.requestId); if (record) record.failed = true; });
    const sample = async (label, action) => {
      records.clear(); suppressed.length = 0;
      await action();
      await page.waitForTimeout(5000);
      const requests = [...records.values()].filter(record => !suppressed.includes(record.path));
      const network = requests.filter(record => !record.cached);
      const tally = list => list.reduce((counts, record) => { const kind = record.path.startsWith('/api/assets/') ? 'r2Images' : record.path.startsWith('/api/') ? 'api' : /\.(js|css|woff2|png|webp|svg|ico)$/.test(record.path) ? 'staticAssets' : 'documents'; counts[kind] = (counts[kind] || 0) + 1; return counts; }, {});
      console.log(JSON.stringify({ width, label, networkRequests: network.length, browserCachedRequests: requests.length - network.length, groups: tally(network), suppressedAuxiliary: suppressed.reduce((counts,path)=>({...counts,[path]:(counts[path]||0)+1}),{}), failed: network.filter(record => record.failed || record.status >= 400).map(record => ({ path: record.path, status: record.status })) }));
    };
    await sample('fresh-home', async () => {
      await page.goto(origin, { waitUntil: 'networkidle', timeout: 45000 });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    });
    await sample('in-app-catalogue-three-products-cart', async () => {
      const openCatalogue = async () => {
        // The desktop quick-links are intentionally hidden on mobile. Use
        // the visible footer collection link there, without forcing a click.
        const link = width < 700 ? '.site-footer a[href="/best-sellers"]' : 'a[href="/just-arrived"]';
        await page.locator(link).first().click();
      };
      await openCatalogue();
      await page.locator('.product-info a').first().waitFor();
      for (let index=0;index<3;index++) {
        await page.locator('.product-info a').nth(index).click();
        await page.locator('.detail-copy h1').waitFor();
        await page.waitForTimeout(2000);
        await openCatalogue();
        await page.locator('.product-info a').first().waitFor();
      }
      await page.locator('a[href="/cart"]').first().click();
      await page.waitForURL('**/cart');
    });
    if (!process.argv.includes('--spa-only')) {
      await sample('browse-catalogue-three-products-cart', async () => {
        await page.goto(origin + '/just-arrived', { waitUntil: 'networkidle', timeout: 45000 });
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        for (const path of products) await page.goto(origin + path, { waitUntil: 'networkidle', timeout: 45000 });
        await page.goto(origin + '/cart', { waitUntil: 'networkidle', timeout: 45000 });
      });
      await sample('repeat-home-same-browser', async () => {
        await page.goto(origin, { waitUntil: 'networkidle', timeout: 45000 });
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      });
    }
    await context.close();
  }
} finally { await browser.close(); }
