import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const worker = process.env.ADMIN_AUDIT_WORKER_URL || 'http://127.0.0.1:8788';
const preview = process.env.ADMIN_AUDIT_UI_URL || 'http://127.0.0.1:5187';
for (const url of [worker, preview]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
const login = await fetch(worker + '/api/auth/demo-admin', { redirect: 'manual' });
assert.equal(login.status, 302);
const cookie = login.headers.get('set-cookie').split(';', 1)[0];
const [name, ...value] = cookie.split('=');
const suffix = randomUUID().slice(0, 8);
const results = [];
const cleanup = [];
const runtimeErrors = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
context.setDefaultTimeout(7000);
await context.addCookies([{ name, value: value.join('='), url: preview }]);
const allowed = /^\/api\/admin\/(?:events|hero|coupons|employees|categories|subcategories|tax-settings)(?:\/|$)/;
async function api(path, method = 'GET', body) {
  assert.ok(method === 'GET' || allowed.test(path), `Mutation outside audit scope: ${path}`);
  const response = await fetch(worker + path, { method, headers: { Cookie: cookie, Origin: worker, 'X-Requested-With': 'Glamia', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
await context.route('**/*', async route => {
  const request = route.request();
  const url = new URL(request.url());
  if (![new URL(preview).origin, new URL(worker).origin].includes(url.origin)) return route.abort();
  if (!url.pathname.startsWith('/api/')) return route.continue();
  if (request.method() !== 'GET' && !allowed.test(url.pathname)) return route.fulfill({ status: 409, json: { error: 'Mutation outside audit scope.' } });
  const response = await route.fetch({ url: worker + url.pathname + url.search, headers: { ...request.headers(), cookie, origin: worker } });
  await route.fulfill({ response });
});
const page = await context.newPage();
page.on('pageerror', error => runtimeErrors.push(error.message));
page.on('dialog', dialog => dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss());
async function navigate(section) {
  await page.goto(preview + '/admin/' + section);
  await page.locator('.admin-panel').first().waitFor();
  await page.waitForLoadState('networkidle');
}
async function check(title, fn) {
  const before = runtimeErrors.length;
  try { await fn(); assert.equal(runtimeErrors.length, before, runtimeErrors.slice(before).join('\n')); results.push({ title, passed: true }); }
  catch (error) { results.push({ title, passed: false, error: error.message }); }
  console.log(JSON.stringify(results.at(-1)));
}
try {
  await check('Event edit preserves the exact original schedule; duplicate and archive work', async () => {
    const eventName = `Audit event ${suffix}`;
    const starts = '2030-10-12T09:14:37.321Z';
    const ends = '2030-10-14T10:15:48.654Z';
    const created = (await api('/api/admin/events', 'POST', { name: eventName, headline: 'Audit headline', message: 'Local audit draft only', status: 'draft', starts_at: starts, ends_at: ends, notify_customers: false })).event;
    cleanup.push(() => api(`/api/admin/events/${created.id}`, 'DELETE'));
    await navigate('events');
    await page.locator('.event-row').filter({ hasText: eventName }).getByRole('button', { name: /^Edit/ }).click();
    await page.locator('input[name="headline"]').fill('Edited audit headline');
    await page.getByRole('button', { name: /^Save changes/ }).click();
    await page.getByText(`${eventName} saved.`, { exact: true }).waitFor();
    const updated = (await api('/api/admin/events')).events.find(item => item.id === created.id);
    assert.equal(updated.starts_at, starts, 'Editing copy must preserve start seconds and milliseconds');
    assert.equal(updated.ends_at, ends);
    const row = page.locator('.event-row').filter({ hasText: eventName });
    await row.getByRole('button', { name: 'Duplicate', exact: true }).click();
    assert.equal(await page.locator('input[name="name"]').inputValue(), eventName + ' copy');
    assert.equal(await page.locator('select[name="status"]').inputValue(), 'draft');
    assert.equal(await page.locator('input[name="notify_customers"]').isChecked(), false);
    await page.getByRole('button', { name: 'Back to overview' }).click();
    await row.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(row.locator('.event-status')).toHaveText('Archived');
  });
  await check('Event creation through the editor, filter, and test-fixture delete', async () => {
    const eventName = `Audit editor ${suffix}`;
    await navigate('events');
    await page.getByRole('button', { name: /^Create an event/ }).first().click();
    await page.locator('input[name="name"]').fill(eventName);
    await page.locator('input[name="headline"]').fill('Local draft');
    await page.locator('textarea[name="message"]').fill('Test fixture, notifications disabled.');
    const response = page.waitForResponse(response => response.url().endsWith('/api/admin/events') && response.request().method() === 'POST');
    await page.getByRole('button', { name: /^Create event/ }).click();
    const data = await (await response).json();
    assert.ok(data.event?.id);
    cleanup.push(async () => { if ((await api('/api/admin/events')).events.some(item => item.id === data.event.id)) await api(`/api/admin/events/${data.event.id}`, 'DELETE'); });
    await page.getByText(`${eventName} saved.`, { exact: true }).waitFor();
    await page.getByRole('group', { name: 'Filter events' }).getByRole('button', { name: 'Drafts', exact: true }).click();
    const row = page.locator('.event-row').filter({ hasText: eventName });
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(row).toHaveCount(0);
  });
  await check('Coupon create, edit, persist, eligibility, and local-fixture delete', async () => {
    const code = `QA-${suffix.toUpperCase()}`;
    await navigate('coupons');
    await page.locator('input[name="code"]').fill(code);
    await page.getByLabel('Value', { exact: true }).fill('15');
    await page.getByRole('button', { name: /^Create coupon/ }).click();
    await page.getByText(`Coupon ${code} created successfully.`, { exact: true }).waitFor();
    cleanup.push(async () => { if ((await api('/api/admin/coupons')).coupons.some(item => item.code === code)) await api(`/api/admin/coupons/${code}`, 'DELETE'); });
    await page.getByRole('button', { name: `Edit coupon ${code}`, exact: true }).click();
    await page.getByLabel('Value', { exact: true }).fill('20');
    await page.getByLabel('Eligible audience').selectOption('employees');
    await page.getByRole('button', { name: /^Save coupon changes/ }).click();
    await page.getByText(`Coupon ${code} updated successfully.`, { exact: true }).waitFor();
    const updated = (await api('/api/admin/coupons')).coupons.find(item => item.code === code);
    assert.equal(updated.value, 20);
    assert.equal(updated.employee_only, true);
    await page.reload();
    await page.getByRole('button', { name: `Edit coupon ${code}`, exact: true }).click();
    await expect(page.getByLabel('Value', { exact: true })).toHaveValue('20');
  });
  await check('Employees create, change access, disable/enable and delete test account', async () => {
    const code = `QA-${suffix.toUpperCase()}`;
    await navigate('employees');
    await page.locator('input[name="employee_code"]').fill(code);
    await page.locator('input[name="name"]').fill('Local audit employee');
    await page.locator('input[name="password"]').fill('Local-Audit-Only-123');
    const response = page.waitForResponse(response => response.url().endsWith('/api/admin/employees') && response.request().method() === 'POST');
    await page.getByRole('button', { name: /^Create employee/ }).click();
    const data = await (await response).json();
    assert.ok(data.employee?.id, JSON.stringify(data));
    cleanup.push(async () => { if ((await api('/api/admin/employees')).employees.some(item => item.id === data.employee.id)) await api(`/api/admin/employees/${data.employee.id}`, 'DELETE'); });
    const row = page.locator('.employee-row').filter({ hasText: code });
    await row.locator('summary').click();
    await row.locator('.employee-access-editor select').selectOption('inventory_manager');
    await row.getByRole('button', { name: /^Save access/ }).click();
    await page.getByText('Employee access saved.', { exact: true }).waitFor();
    assert.equal((await api('/api/admin/employees')).employees.find(item => item.id === data.employee.id).position, 'inventory_manager');
    await row.getByRole('button', { name: 'Disable', exact: true }).click();
    await row.getByRole('button', { name: 'Enable', exact: true }).waitFor();
    await row.getByRole('button', { name: 'Enable', exact: true }).click();
    await row.getByRole('button', { name: 'Disable', exact: true }).waitFor();
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(row).toHaveCount(0);
  });
  await check('Category/subcategory create/delete and duplicate error recovery', async () => {
    const category = `Audit ${suffix}`;
    await navigate('categories');
    await page.getByLabel('New category', { exact: true }).fill(category);
    await page.getByRole('button', { name: /^Add category/ }).click();
    await page.getByText('Category added.', { exact: true }).waitFor();
    cleanup.push(async () => { if ((await api('/api/categories')).categories.includes(category)) await api(`/api/admin/categories/${encodeURIComponent(category)}`, 'DELETE'); });
    const row = page.locator('.category-operation').filter({ hasText: category });
    await row.getByPlaceholder('New subcategory').fill('Audit child');
    await row.getByRole('button', { name: 'Add', exact: true }).click();
    await row.getByRole('button', { name: 'Delete Audit child', exact: true }).waitFor();
    await page.getByLabel('New category', { exact: true }).fill(category);
    await page.getByRole('button', { name: /^Add category/ }).click();
    await page.getByText('That category already exists', { exact: true }).waitFor();
    await row.getByRole('button', { name: 'Delete Audit child', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Delete Audit child', exact: true })).toHaveCount(0);
    await row.getByRole('button', { name: 'Delete category', exact: true }).click();
    await expect(row).toHaveCount(0);
  });
  await check('GST business settings save/reload and restore original values', async () => {
    const before = (await api('/api/admin/tax-settings')).settings;
    const restore = async () => { const result = await api('/api/admin/tax-settings', 'PATCH', before); for (const key of ['business_state', 'business_state_code', 'gstin']) assert.equal(result.settings[key], before[key]); };
    cleanup.push(restore);
    await navigate('tax');
    await page.locator('.tax-settings-form select').selectOption('27');
    await page.getByRole('button', { name: 'Save business details', exact: true }).click();
    await page.getByText('Tax settings saved', { exact: true }).waitFor();
    assert.equal((await api('/api/admin/tax-settings')).settings.business_state_code, '27');
    await page.reload();
    await expect(page.locator('.tax-settings-form select')).toHaveValue('27');
    await restore();
  });
  await check('Hero edit displays success confirmation (parent-owned finding)', async () => {
    const products = (await api('/api/products?scope=admin')).products;
    const slideTitle = `Audit hero ${suffix}`;
    const created = await api('/api/admin/hero', 'POST', { title: slideTitle, tagline: 'Draft audit only', product_ids: [products.find(item => item.status === 'live').id], active: false });
    assert.ok(created.id);
    cleanup.push(() => api(`/api/admin/hero/${created.id}`, 'DELETE'));
    await navigate('hero');
    await page.locator('.merch-slide-row').filter({ hasText: slideTitle }).getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#hero-slide-form input[name="title"]').fill(slideTitle + ' edit');
    await page.getByRole('button', { name: /^Save slide/ }).click();
    await expect(page.locator('.merch-slide-row').filter({ hasText: slideTitle + ' edit' })).toHaveCount(1);
    await page.getByText('Hero slide updated.', { exact: true }).waitFor();
  });
  await check('Category network errors are visible and do not reject globally', async () => {
    await navigate('categories');
    const pattern = '**/api/admin/categories';
    await context.route(pattern, route => route.abort('failed'));
    try {
      await page.getByLabel('New category', { exact: true }).fill(`Network ${suffix}`);
      await page.getByRole('button', { name: /^Add category/ }).click();
      await page.locator('.inline-error').filter({ hasText: /fetch|network|created/i }).waitFor();
    } finally { await context.unroute(pattern); }
  });
  await check('System email-events API errors are visible', async () => {
    const pattern = '**/api/admin/email-events';
    await context.route(pattern, route => route.fulfill({ status: 500, json: { error: 'Audit email events unavailable' } }));
    try { await navigate('system'); await page.getByText('Audit email events unavailable', { exact: true }).waitFor(); }
    finally { await context.unroute(pattern); }
  });
  await check('System backup network errors are visible', async () => {
    await navigate('system');
    const pattern = '**/api/admin/backup';
    await context.route(pattern, route => route.abort('failed'));
    try { await page.getByRole('button', { name: /^Download data backup/ }).click(); await page.locator('.inline-error').filter({ hasText: /fetch|network|download/i }).waitFor(); }
    finally { await context.unroute(pattern); }
  });
  await check('Label sample is exact thermal SVG and unsaved tracking is excluded', async () => {
    const order = { id: `qa-order-${suffix}`, order_number: 'GM-AUDIT', customer_name: 'Local audit', total: 100, items: [{ name: 'Audit item', quantity: 1 }], tracking_number: 'TRACK-1234', shipping: { name: 'Local audit' } };
    const pattern = '**/api/orders?*';
    await context.route(pattern, route => route.fulfill({ json: { orders: [order], pagination: { total: 1, has_more: false } } }));
    try {
      await navigate('labels');
      const sample = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download sample label', exact: true }).click();
      const svg = await readFile(await (await sample).path(), 'utf8');
      assert.match(svg, /width="100mm" height="150mm"/);
      await page.getByLabel('Tracking number', { exact: true }).fill('UNSAVED-5678');
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download label', exact: true }).click();
      const label = await readFile(await (await download).path(), 'utf8');
      assert.match(label, /TRACK-1234/);
      assert.doesNotMatch(label, /UNSAVED-5678/);
    } finally { await context.unroute(pattern); }
  });
} finally {
  for (const restore of cleanup.reverse()) {
    try { await restore(); } catch (error) { results.push({ title: 'Fixture cleanup', passed: false, error: error.message }); console.error(error.message); }
  }
  await browser.close();
}
console.log(JSON.stringify({ results, runtimeErrors }, null, 2));
assert.equal(results.filter(item => !item.passed).length, 0, 'Admin regressions must pass; see findings above.');
