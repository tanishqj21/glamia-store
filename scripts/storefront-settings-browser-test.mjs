import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:8788';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use isolated local fixtures only.');
const login = await fetch(`${base}/api/auth/demo-admin`, { redirect: 'manual' });
assert.equal(login.status, 302);
const cookie = login.headers.get('set-cookie').split(';')[0];
const [name, ...value] = cookie.split('=');
const call = (path, body) => fetch(base + path, { method: body ? 'PUT' : 'GET', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-Requested-With': 'Glamia' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const original = await (await call('/api/admin/storefront-settings')).json();
const browser = await chromium.launch();
const errors = [];
try {
  // Prime the anonymous HTML cache before the write, then verify invalidation.
  await fetch(base).then(response => response.text());
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, timezoneId: 'Asia/Kolkata', reducedMotion: 'reduce' });
    await context.addCookies([{ name, value: value.join('='), url: base }]);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/admin/storefront`);
    await page.getByRole('heading', { name: 'Storefront settings', exact: true }).waitFor();
    await page.getByLabel('Permanent announcement text').fill('Local shipping promise');
    await page.getByLabel('Show announcement bar', { exact: true }).check();
    await page.getByLabel('Show trust strip', { exact: true }).check();
    await page.getByLabel('Show shipping promise', { exact: true }).check();
    await page.getByLabel('Show returns promise', { exact: true }).uncheck();
    await page.getByLabel('Supporting text', { exact: true }).nth(0).fill('Carefully packed locally');
    await page.getByLabel('Instagram', { exact: true }).fill('https://www.instagram.com/glamia_local_test/');
    await page.getByLabel('Homepage title', { exact: true }).fill('Local Glamia title');
    await page.locator('.settings-react-form textarea').last().fill('Local saved storefront description.');
    await page.getByLabel('Social sharing image URL', { exact: true }).fill('https://example.com/local-sharing.png');
    const fresh = page.waitForResponse(response => new URL(response.url()).pathname === '/api/storefront-settings' && response.ok() && !new URL(response.url()).search);
    await page.getByRole('button', { name: /Save storefront settings/ }).click();
    await page.getByText('Storefront settings saved.', { exact: true }).waitFor();
    await fresh;
    // SPA navigation: no reload may be needed to see committed settings.
    await page.getByRole('banner').getByRole('link', { name: 'Glamia home', exact: true }).click();
    await expect(page.locator('.announce')).toContainText('Local shipping promise');
    await expect(page.locator('.trust-strip')).toContainText('Carefully packed locally');
    assert.equal(await page.locator('.trust-promise').count(), 2);
    await expect(page.getByRole('link', { name: 'Glamia on Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/glamia_local_test/');
    await expect(page).toHaveTitle('Local Glamia title');
    assert.equal(await page.locator('meta[name="description"]').getAttribute('content'), 'Local saved storefront description.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await context.close();
    console.log(`PASS storefront save/SPA refresh/trust/socials/SEO at ${viewport.width}px`);
  }
  const html = await fetch(base).then(response => response.text());
  assert.ok(html.includes('<title>Local Glamia title</title>'));
  assert.ok(html.includes('property="og:title" content="Local Glamia title"'));
  assert.ok(html.includes('property="og:image" content="https://example.com/local-sharing.png"'));
  const invalid = await call('/api/admin/storefront-settings', { seo: { image: 'javascript:alert(1)' } });
  assert.equal(invalid.status, 400);
  assert.equal((await (await call('/api/admin/storefront-settings')).json()).seo.image, 'https://example.com/local-sharing.png');
  assert.equal((await call('/api/admin/storefront-settings', { seo: { image: '' } })).status, 200);
  assert.equal((await (await call('/api/storefront-settings')).json()).seo.image, 'https://glamiastore.com/glamia-social-banner.png');
  await call('/api/admin/storefront-settings', { announcement: { visible: false }, trust_strip: { visible: false }, socials: { instagram: '' }, support_contact: { visible: false } });
  const context = await browser.newContext();
  const page = await context.newPage();
  // A catalog failure must not suppress independent public settings.
  await context.route('**/api/products?*', route => route.fulfill({ status: 503, json: { error: 'Local fixture' } }));
  await page.goto(base);
  await page.getByText('The collection could not be loaded. Please refresh to try again.', { exact: true }).waitFor();
  await expect(page.locator('.announce')).toHaveCount(0);
  await expect(page.locator('.trust-strip')).toHaveCount(0);
  await expect(page.locator('.footer-socials')).toHaveCount(0);
  await page.goto(`${base}/contact`);
  await expect(page.locator('.contact-method-grid')).toContainText('Coming soon');
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  await context.close();
  assert.deepEqual(errors, []);
  console.log('PASS metadata/cache invalidation, safe sharing URL/fallback, visibility switches and catalog-failure independence.');
} finally {
  assert.equal((await call('/api/admin/storefront-settings', original)).status, 200, 'Restore local settings.');
  await browser.close();
}
