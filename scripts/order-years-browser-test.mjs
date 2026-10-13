// Built storefront, real order API, in-memory database. No production requests.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

const { db, env } = localDatabase();
for (const year of ['2025', '2026']) for (let i = 0; i < 55; i++) {
  db.prepare(`INSERT INTO orders(id,order_number,customer_email,customer_name,items_json,subtotal,total,status,payment_method,payment_status,created_at)
    VALUES(?,?,?,'Local year fixture','[]',100,100,'delivered','razorpay','paid',?)`).run(`${year}-${i}`, `${i % 2 ? 'WB' : 'GM'}-YEAR-${year}-${i}`, 'year@example.com', `${year}-06-01 12:00:00`);
}
const worker = await workerFunctions(['listOrders']);
const owner = { role: 'admin', is_owner: true, email: 'owner@example.com', name: 'Local owner' };
const root = resolve('public');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.avif': 'image/avif', '.html': 'text/html' };
const browser = await chromium.launch(); const errors = [];
mkdirSync('test-results/order-years', { recursive: true });
try {
  for (const brand of ['glamia', 'wibrawl']) for (const width of [390, 1440]) {
    const origin = `https://${brand === 'wibrawl' ? 'wibrawl.' : ''}glamiastore.com`;
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    let empty = false; const calls = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/api/orders') {
        calls.push(Object.fromEntries(url.searchParams));
        if (empty) return route.fulfill({ json: { orders: [], years: [], pagination: { total: 0, pages: 1, has_more: false } } });
        const response = await worker.listOrders(env, owner, 'admin', url.searchParams);
        return route.fulfill({ status: response.status, json: await response.json() });
      }
      if (url.pathname.startsWith('/api/')) {
        const data = url.pathname === '/api/session' ? { user: owner, needs_profile_completion: false }
          : { stats: {}, products: [], slides: [], categories: [], notifications: [], orders: [], unread_count: 0 };
        return route.fulfill({ json: data });
      }
      let file = resolve(root, '.' + decodeURIComponent(url.pathname));
      if (relative(root, file).startsWith('..')) return route.abort();
      if (!existsSync(file) || !extname(file)) file = resolve(root, 'index.html');
      return route.fulfill({ body: readFileSync(file), contentType: mime[extname(file)] || 'application/octet-stream' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/admin/orders');
    const year = page.getByRole('combobox', { name: 'Filter orders by year' });
    await expect(page.locator('.admin-order-card')).toHaveCount(50);
    await expect(year.locator('option[value="2025"]')).toHaveCount(1);
    await year.selectOption('2025');
    await expect(page.locator('.admin-order-card')).toHaveCount(50);
    await expect(page.locator('.orders-year-heading')).toHaveText('2025');
    assert.ok(await page.locator('.admin-order-card-summary').first().innerText().then(text => text.includes('YEAR-2025')));
    await page.getByRole('button', { name: /Load older orders/ }).click();
    await expect(page.locator('.admin-order-card')).toHaveCount(55);
    assert.ok(calls.some(call => call.year === '2025' && call.page === '2'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await year.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/order-years/${brand}-${width}-orders.png` });
    await page.goto(origin + '/admin/completed-orders');
    await expect(page.locator('.completed-order-list article')).toHaveCount(30);
    await year.selectOption('2025');
    await expect(page.locator('.orders-year-heading')).toHaveText('2025');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.completed-order-list article')).toHaveCount(25);
    await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
    await year.selectOption('2026');
    await expect(page.locator('.completed-order-list article')).toHaveCount(30);
    await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible();
    await expect(page.locator('.orders-year-heading')).toHaveText('2026');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: `test-results/order-years/${brand}-${width}-completed.png` });
    empty = true;
    await page.reload(); await expect(year).toBeVisible();
    await expect(page.locator('.completed-order-list article')).toHaveCount(0);
    await year.selectOption('2026'); await expect(page.getByText('0 completed records', { exact: true })).toBeVisible();
    await context.close();
    console.log(brand, width, 'global year options, filtering, pagination, headings, empty state and layout passed');
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); db.close(); }
