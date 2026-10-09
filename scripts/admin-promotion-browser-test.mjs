import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:8788';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Tests must run on an isolated local Worker.');
const login = await fetch(`${base}/api/auth/demo-admin`, { redirect: 'manual' });
assert.equal(login.status, 302);
const cookie = login.headers.get('set-cookie').split(';', 1)[0];
const [cookieName, ...cookieValue] = cookie.split('=');
const code = `EDIT-${randomUUID().slice(0, 8).toUpperCase()}`;
const redemptionId = `test-redemption-${code}`;
const request = (path, { method = 'GET', body, authenticated = true } = {}) => fetch(base + path, {
  method, headers: { ...(authenticated ? { Cookie: cookie } : {}), Origin: base, 'Content-Type': 'application/json', 'X-Requested-With': 'Glamia' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});
const localSql = sql => execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'glamia-audit-db', '--local', '--config', 'scripts/audit/wrangler.jsonc', '--persist-to', resolve(process.env.AUDIT_PERSIST_TO || '.wrangler/credits-bills-audit'), '--command', sql], { stdio: 'pipe' });
const getCoupon = async () => (await request('/api/admin/coupons').then(response => response.json())).coupons.find(coupon => coupon.code === code);
let created = false;
const browser = await chromium.launch();
try {
  const catalog = await request('/api/products?scope=admin').then(response => response.json());
  const product = catalog.products.find(item => item.status === 'live');
  assert.ok(product);
  const startsAt = new Date(Date.now() - 86400000).toISOString();
  const endsAt = new Date(Date.now() + 86400000).toISOString();
  const result = await request('/api/admin/coupons', { method: 'POST', body: {
    code, type: 'percent', value: 20, scope: 'targeted', targets: [{ type: 'product', value: product.id }],
    starts_at: startsAt, ends_at: endsAt, usage_limit: 10, per_user_limit: 3,
    max_discount: 500, min_cart_value: 100, email_targets: ['admin@example.com']
  } });
  assert.equal(result.status, 201, JSON.stringify(await result.clone().json()));
  created = true;
  localSql(`INSERT INTO coupon_redemptions (id, coupon_code, customer_email, order_id) VALUES ('${redemptionId}', '${code}', 'used@example.com', '${redemptionId}');`);
  const before = await getCoupon();
  assert.equal(before.usage_count, 1);
  const path = `/api/admin/coupons/${code}`;
  assert.ok([401, 403].includes((await request(path, { method: 'PATCH', body: { value: 30 }, authenticated: false })).status));
  assert.equal((await request(`/api/employee/admin/coupons/${code}`, { method: 'PATCH', body: { value: 30 }, authenticated: false })).status, 401);
  assert.equal((await request(path, { method: 'PATCH', body: { code: `${code}NEW` } })).status, 400);
  assert.equal((await request(path, { method: 'PATCH', body: { value: 95 } })).status, 400);
  assert.equal((await request(path, { method: 'PATCH', body: { starts_at: endsAt, ends_at: startsAt } })).status, 400);
  assert.equal((await request(path, { method: 'PATCH', body: { targets: [{ type: 'product', value: 'missing-product' }] } })).status, 400);
  assert.equal((await request('/api/admin/coupons/MISSING-EDIT-TEST', { method: 'PATCH', body: { value: 25 } })).status, 404);
  assert.deepEqual((await getCoupon()).email_targets, before.email_targets, 'Rejected updates must leave eligibility intact.');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultTimeout(15000);
  await context.addCookies([{ name: cookieName, value: cookieValue.join('='), url: base }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/admin/coupons`);
  await page.getByRole('button', { name: `Edit coupon ${code}`, exact: true }).click();
  await page.getByRole('heading', { name: `Editing ${code}`, exact: true }).waitFor();
  assert.equal(await page.locator('input[name="code"]').evaluate(input => input.readOnly), true);
  assert.equal(await page.getByLabel('Value', { exact: true }).inputValue(), '20');
  assert.equal(await page.getByLabel('Product scope').inputValue(), 'targeted');
  assert.equal(await page.locator('.target-products-list input:checked').count(), 1);
  await page.locator('.email-token').filter({ hasText: 'admin@example.com' }).waitFor();
  await page.getByLabel('Value', { exact: true }).fill('25');
  await page.getByLabel('Total uses', { exact: true }).fill('20');
  await page.getByLabel('Uses per account', { exact: true }).fill('4');
  await page.locator('input[name="max_discount"]').fill('450');
  await page.locator('input[name="min_cart_value"]').fill('250');
  await page.getByRole('button', { name: /Save coupon changes/ }).click();
  await page.getByText(`Coupon ${code} updated successfully.`, { exact: true }).waitFor();
  const updated = await getCoupon();
  assert.equal(updated.value, 25);
  assert.equal(updated.usage_limit, 20);
  assert.equal(updated.per_user_limit, 4);
  assert.equal(updated.max_discount, 450);
  assert.equal(updated.min_cart_value, 250);
  assert.equal(updated.starts_at, startsAt, 'Unchanged dates must retain exact timestamps and timezone.');
  assert.equal(updated.ends_at, endsAt);
  assert.equal(updated.created_at, before.created_at);
  assert.equal(updated.usage_count, 1, 'Editing must not reset redemptions.');
  assert.deepEqual(updated.targets, before.targets);
  assert.deepEqual(updated.email_targets, before.email_targets);
  await page.reload();
  await page.getByRole('button', { name: `Edit coupon ${code}`, exact: true }).click();
  assert.equal(await page.getByLabel('Value', { exact: true }).inputValue(), '25');
  await page.getByLabel('Eligible audience').selectOption('employees');
  await page.getByLabel('Coupon active', { exact: true }).uncheck();
  await page.getByRole('button', { name: /Save coupon changes/ }).click();
  await page.getByText(`Coupon ${code} updated successfully.`, { exact: true }).waitFor();
  const employeeOffer = await getCoupon();
  assert.equal(employeeOffer.employee_only, true);
  assert.equal(employeeOffer.active, false);
  assert.deepEqual(employeeOffer.email_targets, []);
  const blocked = await request('/api/coupons/validate', { method: 'POST', body: { code, items: [{ id: product.id, quantity: 1 }] } });
  assert.equal(blocked.status, 400, 'Inactive coupons must be rejected at checkout.');
  // NULL is the legacy unlimited per-account value: do not turn it into a one-use cap on edit.
  assert.equal((await request(path, { method: 'PATCH', body: { employee_only: false, active: true, per_user_limit: null } })).status, 200);
  await page.reload();
  await page.getByRole('button', { name: `Edit coupon ${code}`, exact: true }).click();
  assert.equal(await page.getByLabel('Uses per account', { exact: true }).inputValue(), '');
  await page.getByLabel('Value', { exact: true }).fill('30');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.getByRole('button', { name: /Save coupon changes/ }).click();
  await page.getByText(`Coupon ${code} updated successfully.`, { exact: true }).waitFor();
  assert.equal((await getCoupon()).per_user_limit, null);
  const validation = await request('/api/coupons/validate', { method: 'POST', body: { code, items: [{ id: product.id, quantity: 1 }] } });
  assert.equal(validation.status, 200);
  assert.equal((await validation.json()).value, 30, 'Checkout must use the edited discount.');

  await page.goto(`${base}/admin/storefront`);
  await page.getByRole('heading', { name: 'Storefront settings', exact: true }).waitFor();
  assert.equal(await page.locator('.sales-campaign-settings').count(), 0);
  assert.equal(await page.getByText('Sale campaign', { exact: true }).count(), 0);
  const settings = await request('/api/admin/storefront-settings').then(response => response.json());
  assert.equal('sales_campaign' in settings, false, 'Campaign editor data belongs to Events, not Storefront.');
  await page.getByRole('button', { name: /Save storefront settings/ }).click();
  await page.getByText('Storefront settings saved.', { exact: true }).waitFor();

  // Archive/restore UI fixtures never mutate the local or live product listings.
  const fixtures = [
    { ...product, id: 'qa-live', name: 'Archive UI live', status: 'live' },
    { ...product, id: 'qa-hold', name: 'Archive UI hold', status: 'hold' },
    { ...product, id: 'qa-archived', name: 'Archive UI archived', status: 'archived' }
  ];
  await context.route('**/api/products?*', route => new URL(route.request().url()).searchParams.get('scope') === 'admin'
    ? route.fulfill({ json: { products: fixtures, pagination: { has_more: false, total: 3 } } }) : route.continue());
  await context.route('**/api/admin/products/qa-*', async route => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    const current = fixtures.find(item => item.id === id);
    Object.assign(current, route.request().postDataJSON());
    await route.fulfill({ json: { product: current } });
  });
  await page.goto(`${base}/admin/products`);
  const rows = page.locator('.manage-product-row');
  await rows.filter({ hasText: 'Archive UI live' }).waitFor();
  assert.equal(await rows.count(), 2, 'All statuses must exclude archived products.');
  await rows.filter({ hasText: 'Archive UI live' }).getByRole('button', { name: 'Archive', exact: true }).click();
  await rows.filter({ hasText: 'Archive UI live' }).waitFor({ state: 'hidden' });
  await page.getByLabel('Filter products').selectOption('archived');
  assert.equal(await rows.count(), 2);
  await rows.filter({ hasText: 'Archive UI archived' }).getByRole('button', { name: 'Restore', exact: true }).click();
  await rows.filter({ hasText: 'Archive UI archived' }).waitFor({ state: 'hidden' });
  await page.getByLabel('Filter products').selectOption('all');
  await rows.filter({ hasText: 'Archive UI archived' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Coupon editing/authorization/history/checkout, Storefront cleanup, archive/restore, and mobile checks passed.');
} finally {
  if (created) {
    localSql(`DELETE FROM coupon_redemptions WHERE id = '${redemptionId}' AND coupon_code = '${code}';`);
    assert.equal((await request(`/api/admin/coupons/${code}`, { method: 'DELETE' })).status, 200);
  }
  await browser.close();
}
