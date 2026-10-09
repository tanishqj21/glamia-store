import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:8788';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use an isolated local Worker, never the live store.');
const login = await fetch(`${base}/api/auth/demo-admin`, { redirect: 'manual' });
assert.equal(login.status, 302);
const cookie = login.headers.get('set-cookie').split(';', 1)[0];
const [cookieName, ...cookieValue] = cookie.split('=');
const request = (path, options = {}) => fetch(base + path, {
  ...options,
  headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-Requested-With': 'Glamia', ...options.headers }
});
const eventName = `Destination picker test ${Date.now()}`;
let eventId = '';
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(15000);
  await context.addCookies([{ name: cookieName, value: cookieValue.join('='), url: base }]);
  // Fixtures exercise new categories and URL encoding without changing the real catalog.
  await context.route('**/api/categories*', route => route.fulfill({ json: {
    categories: ['Women', 'Kids', 'Accessories & More'],
    subcategories: [{ category: 'Women', name: 'Nightsuits' }, { category: 'Kids', name: 'Sleep & Lounge' }]
  } }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/admin/events`);
  await page.getByRole('button', { name: /Create an event/ }).first().click();
  const destination = page.getByLabel('Button destination', { exact: true });
  assert.equal(await destination.inputValue(), '/offers');
  const options = await destination.locator('option').allTextContents();
  for (const label of ['All Women', 'All Kids', 'Nightsuits · Women', 'Offers', 'Just arrived', 'Best sellers', 'Contact us', 'Your orders']) {
    assert.ok(options.includes(label), `${label} must be available.`);
  }
  await destination.selectOption({ label: 'All Kids' });
  assert.equal(await destination.inputValue(), '/category/Kids');
  await destination.selectOption({ label: 'Sleep & Lounge · Kids' });
  const childLink = new URL(await destination.inputValue(), base);
  assert.equal(childLink.pathname, '/category/Kids');
  assert.equal(childLink.searchParams.get('sub'), 'Sleep & Lounge');
  await destination.selectOption({ label: 'All Accessories & More' });
  assert.equal(await destination.inputValue(), '/category/Accessories%20%26%20More');
  const nightsuitsPath = '/category/Women?sub=Nightsuits';
  await destination.selectOption(nightsuitsPath);
  await page.getByLabel('Internal event name').fill(eventName);
  await page.getByLabel('Storefront headline').fill('Test destination picker');
  await page.getByLabel('Customer-facing message').fill('Local-only draft for destination testing.');
  await page.getByRole('button', { name: /^Create event/ }).click();
  await page.getByText(`${eventName} saved.`, { exact: true }).waitFor();
  const events = await request('/api/admin/events').then(response => response.json());
  const saved = events.events.find(event => event.name === eventName);
  eventId = saved?.id || '';
  assert.ok(eventId);
  assert.equal(saved.cta_href, nightsuitsPath, 'Selected category link must persist to the API.');
  assert.equal(saved.status, 'draft', 'The test must never publish a customer event.');
  await page.reload();
  await page.locator('.event-row').filter({ has: page.getByRole('heading', { name: eventName, exact: true }) }).getByRole('button', { name: /^Edit/ }).click();
  assert.equal(await destination.inputValue(), nightsuitsPath, 'Saved category is selected on reopen.');
  await destination.selectOption('custom');
  const custom = page.getByLabel('Custom page path', { exact: true });
  await custom.fill('//external.example');
  assert.equal(await custom.evaluate(input => input.checkValidity()), false, 'Protocol-relative external links must be rejected.');
  const customPath = '/product/local-test-product?size=M';
  await custom.fill(customPath);
  await page.getByRole('button', { name: /^Save changes/ }).click();
  await page.getByText(`${eventName} saved.`, { exact: true }).waitFor();
  await page.reload();
  await page.locator('.event-row').filter({ has: page.getByRole('heading', { name: eventName, exact: true }) }).getByRole('button', { name: /^Edit/ }).click();
  assert.equal(await destination.inputValue(), 'custom');
  assert.equal(await custom.inputValue(), customPath, 'Existing product/custom links must not be overwritten.');
  await page.setViewportSize({ width: 390, height: 844 });
  await destination.selectOption('/just-arrived');
  await destination.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Mobile editor must not overflow.');
  assert.deepEqual(errors, []);
  console.log('Destination groups, dynamic catalog, URL encoding, save/reopen, custom links, and mobile layout passed.');
} finally {
  if (!eventId) {
    const data = await request('/api/admin/events').then(response => response.json());
    eventId = data.events?.find(event => event.name === eventName)?.id || '';
  }
  if (eventId) assert.equal((await request(`/api/admin/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' })).status, 200);
  await browser.close();
}
