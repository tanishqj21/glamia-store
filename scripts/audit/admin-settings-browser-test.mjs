import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const worker = process.env.ADMIN_AUDIT_WORKER_URL || 'http://127.0.0.1:8788';
const preview = process.env.ADMIN_AUDIT_UI_URL || 'http://127.0.0.1:5187';
for (const url of [worker, preview]) {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Audit must stay local.');
}
const login = await fetch(`${worker}/api/auth/demo-admin`, { redirect: 'manual' });
assert.equal(login.status, 302, 'Local demo admin login');
const cookie = login.headers.get('set-cookie').split(';', 1)[0];
const [cookieName, ...cookieValue] = cookie.split('=');
const errors = [];
const findings = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
context.setDefaultTimeout(15000);
await context.addCookies([{ name: cookieName, value: cookieValue.join('='), url: preview }]);
await context.route('**/*', async route => {
  const request = route.request();
  const url = new URL(request.url());
  if (![new URL(preview).origin, new URL(worker).origin].includes(url.origin)) return route.abort();
  if (!url.pathname.startsWith('/api/')) return route.continue();
  if (request.method() !== 'GET') return route.fulfill({ status: 409, json: { error: 'Read-only audit phase: mutation blocked.' } });
  const response = await route.fetch({ url: worker + url.pathname + url.search, headers: { ...request.headers(), cookie, origin: worker } });
  if (response.status() >= 400) findings.push({ api: url.pathname + url.search, status: response.status() });
  await route.fulfill({ response });
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const routes = ['','storefront','events','hero','tax','coupons','labels','employees','manage-store','add-product','products','bulk-listing','inventory','orders','categories','customers','reviews','questions','deals','returns','support','system','notifications'];
try {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const section of routes) {
      const path = '/admin' + (section ? '/' + section : '');
      await page.goto(preview + path, { waitUntil: 'domcontentloaded' });
      await page.locator('.admin-page').waitFor();
      await page.waitForFunction(() => !/Preparing your|Loading workspace|Loading admin/.test(document.querySelector('#main-content')?.textContent || ''));
      await page.locator('.admin-panel, .admin-dashboard').first().waitFor();
      await page.waitForFunction(() => !document.querySelector('.loading-card, .admin-loading'));
      await page.waitForLoadState('networkidle');
      const result = await page.evaluate(() => ({
        headings: [...document.querySelectorAll('main h1, main h2')].map(node => node.textContent),
        overflow: document.documentElement.scrollWidth > innerWidth + 2,
        messages: [...document.querySelectorAll('.inline-error, [role="alert"]')].map(node => node.textContent),
        fields: [...document.querySelectorAll('.admin-panel input, .admin-panel select, .admin-panel textarea')].slice(0, 30).map(node => ({ tag: node.tagName, name: node.name, type: node.type, label: node.closest('label')?.textContent.slice(0, 100) }))
      }));
      assert.equal(new URL(page.url()).pathname, path, `Navigation to ${path}`);
      findings.push({ path, width, ...result });
      console.log(JSON.stringify({ path, width, headings: result.headings.filter((heading) => !['Catalog', 'Campaigns & content', 'People & care', 'Operations'].includes(heading)), overflow: result.overflow, messages: result.messages }));
    }
  }
  assert.deepEqual(errors, [], 'React runtime errors');
  console.log(JSON.stringify({ errors, failedApis: findings.filter(item => item.api), overflow: findings.filter(item => item.overflow).map(({ path, width }) => ({ path, width })) }));
} finally {
  await browser.close();
}
