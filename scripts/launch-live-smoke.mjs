// Non-financial live release smoke: public reads and browser-local bag changes only.
// Never log session tokens, customer records or provider credentials.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const base = 'https://glamiastore.com';
let checks = 0;
const pass = label => { checks++; console.log(`PASS ${label}`); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function read(path, options = {}) {
  const response = await fetch(new URL(path, base), {
    ...options, signal: AbortSignal.timeout(30000),
    headers: { 'Cache-Control': 'no-cache', ...options.headers },
  });
  assert.ok(response.status < 500, `${path} server status ${response.status}`);
  return response;
}
const manifest = JSON.parse(readFileSync('public/.vite/manifest.json', 'utf8'));
const entry = Object.values(manifest).find(item => item.isEntry);
assert.ok(entry?.file);
const homepage = await read('/');
assert.equal(homepage.status, 200);
const html = await homepage.text();
assert.ok(html.includes(entry.file), 'Live HTML must reference the reviewed release entry');
assert.ok(!html.includes('This page has moved.'));
pass('live homepage serves reviewed entry');
for (const asset of [entry.file, ...(entry.css || [])]) {
  const response = await read('/' + asset);
  assert.equal(response.status, 200);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(readFileSync('public/' + asset)));
  pass(`live asset matches release: ${asset}`);
}
for (const path of ['/api/profile', '/api/orders', '/api/addresses', '/api/admin/dashboard', '/api/admin/employees']) {
  const response = await read(path);
  assert.ok([401, 403].includes(response.status), `${path} must deny anonymous access, got ${response.status}`);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  pass(`anonymous private access denied: ${path}`);
}
const session = await read('/api/session');
assert.equal(session.status, 200);
assert.equal((await session.json()).user, null);
assert.match(session.headers.get('cache-control') || '', /no-store/);
pass('anonymous session remains private and logged out');
const config = await read('/api/config');
assert.equal(config.status, 200);
const configData = await config.json();
assert.ok(configData.googleClientId);
assert.ok(!Object.keys(configData).some(key => /secret|private|password/i.test(key)));
pass('public auth configuration has Google identifier and no secret fields');
for (const path of ['/api/storefront-settings', '/api/hero', '/api/categories']) {
  const response = await read(path);
  assert.equal(response.status, 200);
  await response.json();
  pass(`public settings readable: ${path}`);
}
const productResponse = await read('/api/products?view=cards&include_stock=1&limit=30&page=1');
assert.equal(productResponse.status, 200);
const catalog = await productResponse.json();
const product = (catalog.products || []).find(item => Object.values(item.size_stock || {}).some(stock => Number(stock) >= 2));
assert.ok(product, 'Public catalogue needs an available product for local-bag smoke');
const size = Object.keys(product.size_stock).find(value => Number(product.size_stock[value]) >= 2);
const legacy = await read('/product/' + encodeURIComponent(product.id), { redirect: 'manual' });
assert.equal(legacy.status, 301);
const canonical = new URL(legacy.headers.get('location'), base).pathname;
pass('product legacy URL resolves to canonical product');
const sitemap = await read('/sitemap.xml');
assert.equal(sitemap.status, 200);
assert.ok((await sitemap.text()).includes(base + canonical));
pass('canonical product is present in sitemap');

const browser = await chromium.launch();
const errors = [];
const blockedWrites = [];
let suppressedAuxiliaryRequests = 0;
try {
  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 1000 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    // Local cart interactions are allowed, but no HTTP mutation or financial
    // provider/analytics request is allowed during this smoke.
    await context.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!['GET', 'HEAD'].includes(request.method())) {
        // These existing background requests are expected when viewing a page:
        // Analytics writes visits (including Cloudflare RUM); coupon availability
        // is a POST-shaped read. Suppress these, not financial/account mutations.
        if (url.origin === base && request.method() === 'POST' &&
          ['/api/analytics/track', '/api/coupons/available', '/cdn-cgi/rum'].includes(url.pathname)) {
          suppressedAuxiliaryRequests++;
        } else if (url.origin === base) blockedWrites.push(`${request.method()} ${url.pathname}`);
        return route.abort();
      }
      if (/google-analytics\.com|googletagmanager\.com|analytics\.google\.com|razorpay\.com|phonepe\.com/.test(url.hostname)) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error' && message.text().includes('storefront_hydration_failed')) errors.push(`${label}: ${message.text()}`);
    });
    for (const path of ['/', '/just-arrived', '/best-sellers', '/offers', canonical, '/cart', '/checkout', '/login', '/contact', '/about']) {
      const response = await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      assert.ok(response.status() < 500);
      await page.locator('#main-content').waitFor();
      await page.waitForFunction(() => !/Preparing your|Loading product|Loading collection/.test(document.querySelector('#main-content')?.textContent || ''), { timeout: 30000 });
      await page.locator('h1').first().waitFor({ timeout: 30000 });
      assert.ok(!(await page.locator('#main-content').innerText()).includes('This page has moved.'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${label} ${path} horizontal overflow`);
      pass(`${label} public route ${path === canonical ? 'product detail' : path}`);
    }
    await page.goto(base + canonical);
    await page.locator('.size-list').getByRole('button', { name: size, exact: true }).click();
    await page.getByRole('button', { name: 'Add to bag', exact: true }).click();
    await page.getByText('Added to your cart.', { exact: true }).waitFor();
    const localBag = await page.evaluate(() => JSON.parse(localStorage.getItem('glamia-react-cart') || '[]'));
    assert.ok(localBag.some(item => item.id === product.id && item.size === size && item.quantity === 1));
    pass(`${label} selected size added to browser-local bag`);
    await page.goto(base + '/cart');
    await page.getByRole('button', { name: /Increase quantity/ }).click();
    await page.getByText('Quantity 2', { exact: false }).waitFor();
    await page.getByRole('button', { name: /Decrease quantity/ }).click();
    await page.getByText('Quantity 1', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Continue to checkout', exact: true }).click();
    await page.waitForURL(base + '/checkout');
    await page.locator('h1').first().waitFor();
    pass(`${label} cart quantity and checkout navigation`);
    const callingCode = page.getByRole('combobox', { name: 'Country calling code', exact: true });
    await callingCode.waitFor();
    assert.equal(await callingCode.locator('option').count(), 245);
    await callingCode.selectOption('+1:CA');
    assert.equal(await callingCode.locator('option:checked').innerText(), '+1 · Canada');
    await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('4165550123');
    assert.equal(await callingCode.locator('option:checked').innerText(), '+1 · Canada');
    await callingCode.selectOption('+7:KZ');
    assert.equal(await callingCode.locator('option:checked').innerText(), '+7 · Kazakhstan');
    await callingCode.selectOption('+44');
    assert.equal(await callingCode.locator('option:checked').innerText(), '+44 · UK');
    pass(`${label} complete 245-region calling-code menu and stable shared-code selections`);
    await page.goto(base + '/admin/orders');
    await page.waitForURL(base + '/', { timeout: 30000 });
    pass(`${label} unauthorized admin page redirects home`);
    await context.close();
  }
} finally {
  await browser.close();
}
assert.deepEqual(errors, [], 'Live React runtime errors');
assert.deepEqual(blockedWrites, [], 'Public/local-cart smoke unexpectedly attempted a financial/account mutation');
pass('no React runtime errors or attempted financial/account mutations');
console.log(`Suppressed ${suppressedAuxiliaryRequests} expected analytics/coupon-availability POSTs; these endpoints were not live-tested.`);
console.log(`PASS ${checks} live checks. No order/payment/provider session was created.`);
