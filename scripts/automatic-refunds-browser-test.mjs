// Local website + real Worker/SQLite. Every gateway response is mocked: no money moves.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

const base = process.env.REFUND_PREVIEW_URL || 'http://127.0.0.1:5189';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const browser = await chromium.launch();
const errors = [];
try {
  for (const width of [1440, 390]) {
    const { db, env } = localDatabase();
    Object.assign(env, { ADMIN_EMAILS: ['owner@example.com'], GATEWAY_REFUNDS_ENABLED: 'true',
      AUTOMATIC_GATEWAY_REFUNDS_ENABLED: 'true', RAZORPAY_KEY_ID: 'fixture', RAZORPAY_KEY_SECRET: 'fixture', DISABLE_OUTBOUND_PUSH: 'true' });
    db.prepare(`INSERT INTO orders(id,order_number,customer_email,items_json,subtotal,total,status,payment_method,
      payment_status,payment_gateway,gateway_order_id,gateway_payment_id,payable_total)
      VALUES('auto-browser-order','GM-AUTO-BROWSER','buyer@example.com','[]',500,500,'delivered','razorpay','paid','razorpay','order_browser','pay_browser',500)`).run();
    db.prepare(`INSERT INTO return_requests(id,order_id,customer_email,type,reason,status,refund_amount,refund_destination)
      VALUES('auto-browser-return','auto-browser-order','buyer@example.com','refund','Local only','approved',500,'original')`).run();
    let state = 'pending', posts = 0;
    const worker = await workerFunctions(['listReturns', 'updateReturnRequest', 'handleGatewayRefund'], { fetch: async (input, init = {}) => {
      const url = new URL(input);
      assert.equal(url.origin, 'https://api.razorpay.com');
      if (url.pathname === '/v1/payments/pay_browser') return Response.json({ id: 'pay_browser', order_id: 'order_browser', currency: 'INR', amount: 50000, amount_refunded: 0, status: 'captured' });
      if (url.pathname === '/v1/payments/pay_browser/refund') { posts++; return Response.json({ id: 'rfnd_browser', status: 'pending' }); }
      if (url.pathname === '/v1/refunds/rfnd_browser') return Response.json({ id: 'rfnd_browser', entity: 'refund', payment_id: 'pay_browser', currency: 'INR', amount: 50000, status: state });
      throw Error(`Unexpected mock path ${url.pathname} ${init.method}`);
    } });
    let actor = { role: 'admin', is_owner: true, email: 'owner@example.com', name: 'Local owner' };
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss());
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) return url.origin === new URL(base).origin ? route.continue() : route.abort();
      if (url.pathname === '/api/session') return route.fulfill({ json: { user: actor, needs_profile_completion: false } });
      try {
        let response;
        if (url.pathname === '/api/returns') response = await worker.listReturns(env, actor, 'admin');
        if (url.pathname === '/api/admin/returns/auto-browser-return') response = await worker.updateReturnRequest(new Request(request.url(), { method: 'PATCH', body: request.postData() }), env, actor, 'auto-browser-return');
        const refund = url.pathname.match(/^\/api\/admin\/returns\/([^/]+)\/refund(?:\/(\w+))?$/);
        if (refund) response = await worker.handleGatewayRefund(new Request(request.url(), { method: request.method(), ...(request.method() === 'GET' ? {} : { body: request.postData() }) }), env, actor, refund[1], refund[2]);
        if (response) return route.fulfill({ status: response.status, json: await response.json() });
        return route.fulfill({ json: { stats: {}, products: [], categories: [], notifications: [], unread: 0 } });
      } catch (error) { return route.fulfill({ status: error.status || 500, json: { error: error.message } }); }
    });
    try {
      await page.goto(base + '/admin/returns');
      await expect(page.getByText(/Original-payment refunds start automatically/)).toBeVisible();
      const control = page.getByLabel('Update request auto-browser-return');
      await control.selectOption('received');
      await expect(page.getByText('Provider processing', { exact: true })).toBeVisible();
      assert.equal(posts, 1);
      assert.equal(db.prepare('SELECT status FROM return_requests').get().status, 'received');
      await expect(page.getByRole('button', { name: 'Approve refund amount', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Send approved refund', exact: true })).toHaveCount(0);
      state = 'processed';
      await page.getByRole('button', { name: 'Check provider status', exact: true }).click();
      await expect(page.getByText('Payment provider confirmed', { exact: true })).toBeVisible();
      assert.equal(posts, 1);
      assert.equal(db.prepare('SELECT status FROM return_requests').get().status, 'refunded');
      await page.getByRole('button', { name: 'View refund log', exact: true }).click();
      await expect(page.getByRole('list', { name: 'Refund audit log' })).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(axe.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => v.id), []);
      // A second fixture remains approved; delegated returns staff cannot select receipt.
      db.prepare(`INSERT INTO return_requests(id,order_id,customer_email,type,reason,status,refund_amount,refund_destination)
        VALUES('staff-return','auto-browser-order','buyer@example.com','refund','Local staff permission test','approved',500,'original')`).run();
      actor = { ...actor, is_owner: false, employee_id: 'local-staff', employee_permissions: { returns: true } };
      await page.goto(base + '/admin/returns');
      await expect(page.getByLabel('Update request staff-return')).toBeVisible();
      await expect(page.getByLabel('Update request staff-return').locator('option[value="received"]')).toHaveCount(0);
      console.log(`PASS automatic receipt, pending/verified completion, no extra send steps, audit, staff permissions, accessibility width=${width}`);
    } finally { await context.close(); db.close(); }
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
