// Actual local website UI + in-memory Worker/D1. No live credentials or payouts.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

const base = 'http://127.0.0.1:5189';
const output = new URL('../tmp/refund-walkthrough-2026-10-02/', import.meta.url);
await mkdir(output, { recursive: true });
const { db, env } = localDatabase();
Object.assign(env, { ADMIN_EMAILS: ['owner@example.com'], GATEWAY_REFUNDS_ENABLED: 'true',
  RAZORPAY_KEY_ID: 'local_demo', RAZORPAY_KEY_SECRET: 'local_demo_not_a_real_key', DISABLE_OUTBOUND_PUSH: 'true' });
const order = { id: 'demo-refund-order', order_number: 'GM-DEMO-REFUND-001', customer_email: 'buyer@example.com',
  customer_name: 'Demo customer', subtotal: 949, total: 949, status: 'delivered', payment_method: 'razorpay',
  payment_status: 'paid', created_at: new Date().toISOString(), bill_available: true,
  items: [{ name: 'Night Suit — Sage Green', size: 'M', quantity: 1 }] };
db.prepare(`INSERT INTO orders(id,order_number,customer_email,customer_name,items_json,subtotal,total,status,
  payment_method,payment_status,payment_gateway,gateway_order_id,gateway_payment_id,payable_total)
  VALUES(?,?,?,?,?,949,949,'delivered','razorpay','paid','razorpay','order_demo','pay_demo',949)`)
  .run(order.id, order.order_number, order.customer_email, order.customer_name, JSON.stringify(order.items));
let providerStatus = 'pending', posts = 0, returnId;
const worker = await workerFunctions(['createReturnRequest', 'listReturns', 'handleGatewayRefund', 'updateReturnRequest'], {
  fetch: async (input, init = {}) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://api.razorpay.com');
    if (url.pathname === '/v1/payments/pay_demo') return Response.json({ id: 'pay_demo', order_id: 'order_demo',
      currency: 'INR', amount: 94900, amount_refunded: 0, status: 'captured' });
    if (url.pathname === '/v1/payments/pay_demo/refund') {
      assert.equal(init.method, 'POST'); posts++;
      return Response.json({ id: 'rfnd_DEMOONLY', status: 'pending' });
    }
    if (url.pathname === '/v1/refunds/rfnd_DEMOONLY') return Response.json({ id: 'rfnd_DEMOONLY', entity: 'refund',
      payment_id: 'pay_demo', currency: 'INR', amount: 94900, status: providerStatus });
    throw Error(`Unexpected simulated provider path: ${url.pathname}`);
  }
});
let actor = { role: 'customer', email: 'buyer@example.com', name: 'Demo customer', is_owner: false };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
await context.addInitScript(() => localStorage.setItem('glamia-theme', 'dark'));
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss());
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== base) return route.abort();
  if (!url.pathname.startsWith('/api/')) return route.continue();
  if (url.pathname === '/api/session') return route.fulfill({ json: { user: actor, needs_profile_completion: false } });
  if (url.pathname === '/api/orders') return route.fulfill({ json: { orders: [order] } });
  try {
    let response;
    const makeRequest = () => new Request(request.url(), { method: request.method(),
      ...(request.method() === 'GET' ? {} : { body: request.postData() }) });
    if (url.pathname === '/api/returns') response = await worker.listReturns(env, actor, url.searchParams.get('scope') || 'customer');
    if (url.pathname === `/api/orders/${order.id}/returns`) {
      response = await worker.createReturnRequest(makeRequest(), env, actor, order.id);
      returnId = db.prepare('SELECT id FROM return_requests').get()?.id;
    }
    const refund = url.pathname.match(/^\/api\/admin\/returns\/([^/]+)\/refund(?:\/(\w+))?$/);
    if (refund) response = await worker.handleGatewayRefund(makeRequest(), env, actor, refund[1], refund[2]);
    if (url.pathname === `/api/admin/returns/${returnId}`) response = await worker.updateReturnRequest(makeRequest(), env, actor, returnId);
    if (response) return route.fulfill({ status: response.status, json: await response.json() });
    return route.fulfill({ json: { stats: {}, products: [], slides: [], categories: [], notifications: [], orders: [],
      requests: [], addresses: [], unread: 0, balance: 0, settings: {} } });
  } catch (error) { return route.fulfill({ status: error.status || 500, json: { error: error.message } }); }
});
async function capture(name, locator) {
  await expect(page.locator('#initial-loader')).toHaveCount(0);
  await expect(locator).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await locator.screenshot({ path: fileURLToPath(new URL(name + '.png', output)) });
  console.log(`SCREENSHOT ${name}`);
}
try {
  await page.goto(base + '/orders');
  await expect(page.getByRole('button', { name: 'Return / Refund', exact: true })).toBeVisible();
  await capture('01-buyer-order', page.locator('.account-page'));
  await page.getByRole('button', { name: 'Return / Refund', exact: true }).click();
  await page.getByLabel('Refund destination').selectOption('original');
  await page.getByLabel('Reason', { exact: true }).fill('Demo return: the fit is not right.');
  await capture('02-buyer-request', page.getByRole('dialog'));
  await page.getByRole('button', { name: 'Submit request', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.ok(returnId);
  actor = { role: 'admin', email: 'owner@example.com', name: 'Demo owner', is_owner: true };
  await page.goto(base + '/admin/returns');
  const panel = page.locator('.admin-panel').filter({ has: page.getByRole('heading', { name: 'Returns and exchanges', exact: true }) });
  const status = page.getByLabel(`Update request ${returnId}`, { exact: true });
  await expect(status).toHaveValue('requested');
  await capture('03-admin-review', panel);
  await status.selectOption('approved');
  await expect(status).toHaveValue('approved');
  await status.selectOption('received');
  await expect(page.getByRole('button', { name: 'Approve refund amount', exact: true })).toBeVisible();
  await capture('04-received-approve-amount', panel);
  await page.getByRole('button', { name: 'Approve refund amount', exact: true }).click();
  await expect(page.getByText('Owner approved · not sent', { exact: true })).toBeVisible();
  assert.equal(posts, 0);
  await capture('05-approved-send-refund', panel);
  await page.getByRole('button', { name: 'Send approved refund', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Provider processing', { exact: true })).toBeVisible();
  assert.equal(posts, 1);
  await capture('06-provider-processing', panel);
  providerStatus = 'processed';
  await page.getByRole('button', { name: 'Check provider status', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Payment provider confirmed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View refund log', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('list', { name: 'Refund audit log' })).toBeVisible();
  await capture('07-confirmed-and-log', panel);
  assert.equal(db.prepare('SELECT payment_status FROM orders').get().payment_status, 'refunded');
  assert.equal(posts, 1);
  assert.deepEqual(errors, []);
  console.log('PASS seven actual-UI screenshots. In-memory demo only; all provider traffic simulated.');
} finally { await browser.close(); db.close(); }
