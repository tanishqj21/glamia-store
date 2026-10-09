// Built website, isolated local Worker and synthetic payment/PDF responses only.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { chromium, expect } from '@playwright/test';

const base = 'http://127.0.0.1:8788';
const db = new DatabaseSync('.wrangler/bill-branding-audit/v3/d1/miniflare-D1DatabaseObject/a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite');
db.prepare(`INSERT OR IGNORE INTO orders(id,order_number,customer_email,customer_name,items_json,subtotal,total,payable_total,
  status,payment_method,payment_status,tracking_token,shipping_json)
  VALUES ('synthetic-preview-order','GM-PREVIEW-001','preview@example.com','Aarav Sharma',?,500,500,500,
  'confirmed','razorpay','paid','local-guest-token',?)`).run(
  JSON.stringify([{ name: 'Local preview shirt', quantity: 1, price: 500, size: 'M' }]),
  JSON.stringify({ line1: '24 Example Lane', city: 'New Delhi', state: 'Delhi', country: 'India' }));
assert.ok(db.prepare("SELECT bill_number FROM order_bills WHERE order_id='synthetic-preview-order'").get());
db.close();
const browser = await chromium.launch();
await mkdir('tmp/pdfs', { recursive: true });
try {
  for (const [theme, width, billAvailable] of [['dark', 1280, true], ['light', 390, true], ['dark', 390, false]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(theme => {
      localStorage.setItem('glamia-theme', theme);
      localStorage.setItem('glamia-react-cart', JSON.stringify([{ id: 'seed-ivory-linen-shirt', size: 'M', quantity: 1 }]));
    }, theme);
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base) return route.abort();
      if (url.pathname === '/api/storefront-settings') {
        const data = await (await route.fetch()).json();
        data.payments = { methods: [{ id: 'razorpay', label: 'Razorpay' }] };
        return route.fulfill({ json: data });
      }
      if (url.pathname === '/api/payments/create') return route.fulfill({ json: {
        payment_status: 'paid', order: { id: 'synthetic-preview-order', order_number: 'GM-PREVIEW-001',
          status: 'confirmed', payment_status: 'paid', bill_available: billAvailable, tracking_token: 'local-guest-token' },
      } });
      if (url.pathname === '/api/orders/synthetic-preview-order/bill') {
        assert.equal(url.searchParams.get('token'), 'local-guest-token');
        return route.continue();
      }
      if (!['GET', 'HEAD'].includes(request.method())) return route.fulfill({ json: {} });
      return route.continue();
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/checkout');
    await expect(page.getByText('Checking stock and payment availability…')).toHaveCount(0);
    await page.getByLabel('Email for order updates').fill('preview@example.com');
    await page.getByLabel('Full name', { exact: true }).fill('Aarav Sharma');
    await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('9990116600');
    await page.getByLabel('Address line', { exact: true }).fill('24 Example Lane');
    await page.getByLabel('City / town').fill('New Delhi');
    await page.getByRole('button', { name: /Pay securely/ }).click();
    await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    const link = page.getByRole('link', { name: 'Download bill', exact: true });
    if (billAvailable) {
      await expect(link).toBeVisible();
      const download = page.waitForEvent('download');
      await link.click();
      const file = await download;
      assert.match(file.suggestedFilename(), /^Glamia-bill-.*\.pdf$/);
      assert.equal((await readFile(await file.path())).subarray(0, 4).toString(), '%PDF');
    } else {
      await expect(link).toHaveCount(0);
      await expect(page.getByText(/Your bill is being prepared/)).toBeVisible();
    }
    await page.screenshot({ path: `tmp/pdfs/order-confirmation-${theme}-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS styled confirmation ${theme} ${width}px bill=${billAvailable}`);
  }
} finally { await browser.close(); }
