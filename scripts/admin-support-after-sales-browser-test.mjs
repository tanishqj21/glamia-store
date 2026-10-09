// Browser + real in-memory Worker/SQLite; every nonlocal URL is blocked.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { adminReturnsFixture, owner, staff, customer } from './lib/admin-returns-fixture.mjs';
import { workerFunctions } from './lib/worker-fixture.mjs';

const base = 'http://127.0.0.1:5193';
const output = new URL('../test-results/admin-support-after-sales/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
async function fixture(width, theme, actor = owner,options) {
  const f = await adminReturnsFixture(options);
  const support = await workerFunctions(['createSupportTicket', 'listSupportTickets', 'listSupportMessages']);
  const state = { optionReads: 0, orderReads: 0, posts: 0, failOrders: false, emptyOrders: false };
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(theme => localStorage.setItem('glamia-theme', theme), theme);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/session') return route.fulfill({ json: { user: actor, needs_profile_completion: false } });
    try {
      let response;
      if (url.pathname === '/api/orders') {
        state.orderReads++;
        if (state.failOrders) return route.fulfill({ status: 500, json: { error: 'fixture failure' } });
        response = state.emptyOrders ? Response.json({ orders: [] }) : await f.worker.listOrders(f.env, actor, url.searchParams.get('scope'), url.searchParams);
      }
      if (url.pathname === '/api/admin/returns/orders/manual-order') {
        if (req.method() === 'GET') { state.optionReads++; response = await f.options(actor); }
        else { state.posts++; response = await f.create(req.postDataJSON(), actor); }
      }
      if (url.pathname === '/api/returns') response = await f.worker.listReturns(f.env, actor, url.searchParams.get('scope'));
      if (url.pathname === '/api/support/tickets') {
        if (req.method() === 'POST') { state.posts++; response = await support.createSupportTicket(new Request(req.url(), { method: 'POST', body: req.postData() }), f.env, actor); }
        else response = actor ? await support.listSupportTickets(f.env, actor) : Response.json({ tickets: [] });
      }
      const messages = url.pathname.match(/^\/api\/support\/tickets\/([^/]+)\/messages$/);
      if (messages && actor) response = await support.listSupportMessages(f.env, actor, messages[1]);
      if (response) return route.fulfill({ status: response.status, json: await response.json() });
      return route.fulfill({ json: { stats: {}, orders: [], products: [], categories: [], notifications: [], unread: 0, balance: 0, tickets: [], messages: [] } });
    } catch (error) { return route.fulfill({ status: error.status || 500, json: { error: error.message } }); }
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { ...f, context, page, state, close: async () => { await context.close(); f.db.close(); } };
}
async function audit(page, scope) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, 'no horizontal overflow');
  const result = await new AxeBuilder({ page }).include(scope).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  assert.deepEqual(result.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => ({ id: v.id, nodes: v.nodes.map(n => n.failureSummary) })), []);
}
async function screenshot(page, name) {
  await page.evaluate(() => document.activeElement?.blur());
  await page.mouse.move(0, 0);
  await expect.poll(() => page.locator('.skip-link').evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
  // Full-page capture avoids tall-element screenshots moving fixed browser UI.
  await page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true, animations: 'disabled' });
}
async function openAdmin(f) {
  await f.page.goto(base + '/admin/orders');
  await expect(f.page.locator('.admin-order-card-summary')).toHaveCount(1);
  assert.equal(f.state.optionReads, 0);
  await f.page.locator('.admin-order-card-summary').click();
  await f.page.getByRole('button', { name: 'Create refund / exchange', exact: true }).click();
  await expect(f.page.getByLabel('Reason for this request')).toBeVisible();
}
try {
  for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'light'], [390, 'dark']]) {
    const f = await fixture(width, theme);
    try {
      await openAdmin(f);
      await f.page.getByLabel('Reason for this request').fill('Customer requested a return through care.');
      await audit(f.page, '.admin-order-after-sales');
      await screenshot(f.page, `admin-${width}-${theme}.png`);
      await f.page.getByRole('button', { name: 'Create refund request', exact: true }).click();
await expect(f.page.getByText('Refund request created for the customer. Arrange return pickup and save tracking in Returns. No money has been refunded yet.')).toBeVisible();
      assert.equal(f.state.posts, 1);
      assert.equal(f.db.prepare('SELECT customer_email FROM return_requests').get().customer_email, customer.email);
      await f.page.getByRole('button', { name: 'Manage in Returns', exact: true }).click();
      await expect(f.page.getByLabel(/Update request/)).toBeVisible();
      assert.equal(f.networkCalls(), 0);
      console.log(`PASS admin refund ${width}/${theme}`);
    } finally { await f.close(); }
    const s = await fixture(width, theme, customer);
    try {
      await s.page.goto(base + '/support');
      const baseline = s.state.orderReads;
      await s.page.getByRole('button', { name: /Return or exchange/ }).click();
      await expect(s.page.getByRole('heading', { name: 'Which order needs help?' })).toBeVisible();
      assert.equal(s.state.orderReads, baseline + 1);
      await expect(s.page.getByLabel('Message', { exact: true })).toHaveCount(0);
      await expect(s.page.locator('.support-order-option')).toContainText('Ivory linen shirt');
      await expect(s.page.locator('.support-order-option')).toContainText('Size M · Qty 1');
      await expect(s.page.locator('.support-order-option')).toContainText('₹949.5');
      await s.page.getByLabel('Search your orders').fill('no-match');
      await expect(s.page.getByText(/No matching orders/)).toBeVisible();
      await s.page.getByLabel('Search your orders').fill('linen');
      await audit(s.page, '.customer-support-form');
      await screenshot(s.page, `support-orders-${width}-${theme}.png`);
      await s.page.getByRole('button', { name: 'Choose order GM-MANUAL-LOCAL', exact: true }).click();
      await expect(s.page.getByLabel('Order number')).toHaveValue('GM-MANUAL-LOCAL');
      await expect(s.page.getByLabel('Order number')).toHaveAttribute('readonly', '');
      await s.page.getByText('Contact details · optional', { exact: true }).click();
      await expect(s.page.getByLabel('Email', { exact: false })).toHaveValue(customer.email);
      await expect(s.page.getByLabel('Email', { exact: false })).not.toHaveAttribute('required');
      await s.page.getByLabel('Name', { exact: false }).fill('');
      await s.page.getByLabel('Message', { exact: true }).fill('Please help exchange this shirt for another size.');
      await audit(s.page, '.customer-support-form');
      await screenshot(s.page, `support-selected-${width}-${theme}.png`);
      await s.page.getByRole('button', { name: 'Send request', exact: true }).click();
      await expect(s.page.getByText('Your request is with the Glamia care team.')).toBeVisible();
      const ticket = s.db.prepare('SELECT * FROM support_tickets').get();
      assert.equal(ticket.customer_email, customer.email);
      assert.equal(ticket.customer_name, customer.name);
      assert.equal(ticket.order_id, 'manual-order');
      assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM return_requests').get().n, 0);
      console.log(`PASS support choose/search/details/optional identity/send/a11y ${width}/${theme}`);
    } finally { await s.close(); }
  }
  const exchange = await fixture(390, 'dark');
  try {
    await openAdmin(exchange);
    await exchange.page.getByLabel('Request type').selectOption('exchange');
    await exchange.page.getByLabel('Replacement size').selectOption('L');
    await exchange.page.getByLabel('Reason for this request').fill('Customer would like a larger size.');
    await exchange.page.getByRole('button', { name: 'Create exchange request', exact: true }).click();
    await expect(exchange.page.getByText(/The ₹0 replacement is in the normal packing queue/)).toBeVisible();
    assert.equal(exchange.db.prepare("SELECT stock FROM product_sizes WHERE product_id=? AND size='L'").get(exchange.productId).stock, 5);
    assert.equal(exchange.state.posts, 1);
    console.log('PASS exchange immediately places a replacement and reserves stock once');
  } finally { await exchange.close(); }
  const stale = await fixture(390, 'light');
  try {
    await openAdmin(stale);
    await stale.page.getByLabel('Request type').selectOption('exchange');
    await stale.page.getByLabel('Replacement size').selectOption('L');
    await stale.page.getByLabel('Reason for this request').fill('Customer wants a larger size.');
    stale.db.prepare("UPDATE product_sizes SET stock=0 WHERE product_id=? AND size='L'").run(stale.productId);
    await stale.page.getByRole('button', { name: 'Create exchange request', exact: true }).click();
    await expect(stale.page.locator('.admin-order-after-sales [role=alert]')).toBeVisible();
    assert.equal(stale.db.prepare('SELECT COUNT(*) AS n FROM return_requests').get().n, 0);
    await stale.page.getByRole('button', { name: 'Recheck order & stock', exact: true }).click();
    await expect(stale.page.getByLabel('Reason for this request')).toHaveValue('Customer wants a larger size.');
    assert.equal(stale.db.prepare("SELECT stock FROM product_sizes WHERE product_id=? AND size='L'").get(stale.productId).stock, 0);
    console.log('PASS sold-out exchange rechecks without lost reason or stock mutation');
  } finally { await stale.close(); }
  for (const actor of [owner, staff]) {
    const expired = await fixture(390, 'dark', actor,{deliveredAt:new Date(Date.now()-15*86400000).toISOString()});
    try {
      expired.db.prepare("UPDATE orders SET updated_at=datetime('now','-15 days') WHERE id='manual-order'").run();
      await openAdmin(expired);
      await expired.page.getByLabel('Reason for this request').fill('Customer requested a late return.');
      await expect(expired.page.getByRole('button', { name: 'Create refund request', exact: true })).toBeDisabled();
      if (actor.is_owner) {
        await expired.page.getByLabel('Authorise a return-window exception as an owner').check();
        await expired.page.getByLabel('Exception reason (audit log)').fill('Parcel arrived while the customer was travelling.');
        await expired.page.getByRole('button', { name: 'Create refund request', exact: true }).click();
        await expect(expired.page.getByText(/No money has been refunded yet/)).toBeVisible();
        const log = expired.db.prepare("SELECT details_json FROM admin_audit_log WHERE action='admin_create_return_request'").get();
        assert.equal(JSON.parse(log.details_json).return_window_exception, true);
      } else await expect(expired.page.getByLabel('Authorise a return-window exception as an owner')).toHaveCount(0);
      console.log(`PASS explicit expired-window exception actor=${actor.is_owner ? 'owner' : 'staff'}`);
    } finally { await expired.close(); }
  }
  const restricted = await fixture(390, 'light', { ...staff, employee_permissions: { orders: true } });
  try {
    await restricted.page.goto(base + '/admin/orders');
    await restricted.page.locator('.admin-order-card-summary').click();
    await expect(restricted.page.getByRole('button', { name: 'Create refund / exchange', exact: true })).toHaveCount(0);
    console.log('PASS orders-only staff cannot create after-sales requests');
  } finally { await restricted.close(); }
  const retry = await fixture(390, 'dark', customer);
  try {
    retry.state.failOrders = true;
    await retry.page.goto(base + '/support');
    await retry.page.getByRole('button', { name: /Return or exchange/ }).click();
    await expect(retry.page.getByRole('alert')).toContainText('could not be loaded');
    retry.state.failOrders = false;
    retry.state.emptyOrders = true;
    await retry.page.getByRole('button', { name: 'Retry loading orders', exact: true }).click();
    await expect(retry.page.getByText('No orders on this account yet')).toBeVisible();
    await retry.page.getByRole('button', { name: /Product question/ }).click();
    await expect(retry.page.getByLabel('Message', { exact: true })).toBeVisible();
    console.log('PASS loading failure/retry/empty/back to general support');
  } finally { await retry.close(); }
  const guest = await fixture(390, 'light', null);
  try {
    await guest.page.goto(base + '/support');
    await guest.page.getByRole('button', { name: /Return or exchange/ }).click();
    await expect(guest.page.getByText('Sign in to choose your order')).toBeVisible();
    await expect(guest.page.getByLabel('Message', { exact: true })).toHaveCount(0);
    assert.equal(guest.state.orderReads, 0);
    console.log('PASS guest order privacy');
  } finally { await guest.close(); }
  assert.deepEqual(errors, [], 'No browser runtime errors');
} finally { await browser.close(); }
