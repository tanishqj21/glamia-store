// Actual Expo web UI; all APIs are intercepted and no production writes occur.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const base = process.env.EMPLOYEE_PREVIEW_URL || 'http://localhost:8082';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const browser = await chromium.launch();
const errors = [];
const profile = { id: 'local-packer', name: 'Audit Packer', employee_code: 'QA_PACKER', position: 'packing_staff', permissions: { packing: true } };
const order = (id, patch = {}) => ({ id, order_number: id, customer_name: 'Local fixture', customer_email: 'packing@example.com', total: 100, status: 'confirmed', payment_status: 'paid', packing_status: 'unpacked', items: [{ name: 'Local shirt', size: 'M', quantity: 1 }], shipping: {}, ...patch });
let heldRequest = null, holdNext = false, packingWrites = 0;
const paid = order('PAID-ORDER');
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return url.origin === new URL(base).origin ? route.continue() : route.abort();
    let data = {};
    if (url.pathname.endsWith('/auth/login')) data = { token: 'local-only-packing-token', employee: profile };
    else if (url.pathname.endsWith('/session')) data = { employee: profile };
    else if (url.pathname === '/api/employee/orders') {
      if (holdNext && url.searchParams.get('status') === 'unpacked') { holdNext = false; heldRequest = route; return; }
      data = { orders: url.searchParams.get('status') === 'packed' ? [order('PACKED-ORDER', { packing_status: 'packed' })] : [paid, order('UNPAID-ORDER', { payment_status: 'pending' }), order('CANCELLED-ORDER', { status: 'cancelled' })] };
    } else if (url.pathname.endsWith('/packed')) {
      packingWrites++;
      return route.fulfill({ status: 409, json: { error: 'Payment changed; refresh before packing.' } });
    } else if (url.pathname === '/api/employee/orders/PAID-ORDER') data = { order: paid };
    await route.fulfill({ json: data });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.getByRole('textbox', { name: 'Employee ID' }).fill('QA_PACKER');
  await page.getByLabel('Password', { exact: true }).fill('Local-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('PAID-ORDER', { exact: true })).toBeVisible();
  await expect(page.getByText('UNPAID-ORDER', { exact: true })).toHaveCount(0);
  await expect(page.getByText('CANCELLED-ORDER', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mark as packed', exact: true }).click();
  await expect(page.getByText('Payment changed; refresh before packing.', { exact: true })).toBeVisible();
  assert.equal(packingWrites, 1);
  await expect(page.getByText('PAID-ORDER', { exact: true })).toBeVisible();
  holdNext = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => Boolean(heldRequest)).toBe(true);
  await page.getByRole('tab', { name: 'Packed', exact: true }).click();
  await expect(page.getByText('PACKED-ORDER', { exact: true })).toBeVisible();
  await heldRequest.fulfill({ json: { orders: [paid] } }); heldRequest = null;
  // Complete a subsequent read before inspecting state, rather than sleeping.
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('PACKED-ORDER', { exact: true })).toBeVisible();
  await expect(page.getByText('PAID-ORDER', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark as packed', exact: true })).toHaveCount(0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
  assert.deepEqual(errors, []);
  console.log('PASS packing UI: unpaid/cancelled hidden, server conflict shown, no false packed success, stale-filter read ignored, mobile layout.');
  await context.close();
} finally {
  if (heldRequest) await heldRequest.abort().catch(() => {});
  await browser.close();
}
