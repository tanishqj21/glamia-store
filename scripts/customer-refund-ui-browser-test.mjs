// Isolated local UI fixtures: no production reads, financial writes or real refunds.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = process.env.REFUND_UI_URL || 'http://127.0.0.1:5193';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = new URL('../test-results/customer-refund-ui/', import.meta.url);
mkdirSync(output, { recursive: true });
const order = { id: 'local-order', order_number: 'GM-LOCAL-REFUND', status: 'delivered', payment_status: 'paid', payment_method: 'phonepe', total: 949.5, created_at: '2026-10-01T10:00:00Z', bill_available: true, items: [{ id: 'local-product', name: 'Night suit — Sage green', size: 'M', quantity: 1 }] };
const request = { id: 'return-local-customer-reference', order_id: order.id, type: 'refund', status: 'received', reason: 'The size was not right for me.', refund_destination: 'original', refund_amount: 949.5, created_at: '2026-10-02 08:00:00', returned_at: '2026-10-03 08:00:00', gateway_refund: { state: 'pending', total: 949.5, gateway_amount: 849.5, credit_amount: 100, provider: 'phonepe', checked_at: '2026-10-03 08:15:00', last_error: 'AUTHORIZATION_FAILED private-provider-data' } };
const browser = await chromium.launch();
const errors = [];
async function fixture(width, theme) {
  const state = { requests: [structuredClone(request)], status: 200, reads: 0, writes: [], delay: 0 };
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(theme => {
    localStorage.setItem('glamia-theme', theme);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__refundTestVisibility || 'visible' });
  }, theme);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== new URL(base).origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    // Existing page-view analytics are unrelated to refund execution.
    if (req.method() !== 'GET' && url.pathname !== '/api/analytics/track') state.writes.push({ path: url.pathname, body: req.postDataJSON() });
    if (url.pathname === '/api/session') return route.fulfill({ json: { user: { id: 'local-buyer', email: 'buyer@example.com', name: 'Meera Shah', role: 'buyer' }, needs_profile_completion: false } });
    if (url.pathname === '/api/orders') return route.fulfill({ json: { orders: [order] } });
    if (url.pathname === '/api/returns') {
      state.reads++;
      const response = structuredClone(state.requests), status = state.status;
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      return route.fulfill({ status, json: status === 200 ? { requests: response } : { error: 'Internal fixture error: must not display' } });
    }
    if (url.pathname.endsWith('/returns') && req.method() === 'POST') {
      state.requests = [{ ...request, status: 'requested', returned_at: null, gateway_refund: null, refund_destination: req.postDataJSON().refund_destination }];
      return route.fulfill({ json: { request: state.requests[0] } });
    }
    if (url.pathname === '/api/orders/local-order/returns' && req.method()==='GET') return route.fulfill({json:{eligible:true,refund_available:true,exchange_available:true,original_refund_available:true,items:[{line_id:'local-line',product_id:'local-product',product_name:'Night suit — Sage green',size:'M',quantity:1,returnable:true,amount_paise:94950,available_sizes:[{size:'L',stock:5}]}]}});
    if (url.pathname === '/api/products') return route.fulfill({ json: { products: [{ id: 'local-product', name: 'Night suit', category: 'Women', price: 949.5, sizes: ['M', 'L'], size_stock: { M: 5, L: 5 } }] } });
    return route.fulfill({ json: { products: [], categories: [], slides: [], tickets: [], balance: 0, transactions: [], requests: [], items: [], notifications: [] } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.goto(base + '/orders');
  await expect(page.getByRole('heading', { name: 'Provider processing', exact: true })).toBeVisible();
  return { context, page, state };
}
async function refresh(page) {
  await page.getByRole('button', { name: 'Refresh updates', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh updates', exact: true })).toBeEnabled();
}
try {
  for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'light'], [390, 'dark'], [320, 'light']]) {
    const { context, page, state } = await fixture(width, theme);
    try {
      const tracker = page.locator('.refund-tracker');
      await expect(tracker.getByText('₹949.50', { exact: true })).toBeVisible();
      await expect(tracker.getByText('₹849.50', { exact: true })).toBeVisible();
      await expect(tracker.getByText('₹100.00', { exact: true })).toBeVisible();
      await tracker.locator('summary').click();
      await expect(tracker.getByText(/3 Oct 2026, 1:45 pm IST/i)).toBeVisible();
      assert.doesNotMatch(await tracker.innerText(), /AUTHORIZATION_FAILED|private-provider-data/);
      await tracker.locator('summary').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `overflow ${width}/${theme}`);
      const axe = await new AxeBuilder({ page }).include('.account-panel').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(axe.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => ({ id: v.id, nodes: v.nodes.map(n => n.failureSummary) })), [], `accessibility ${width}/${theme}`);
      await page.evaluate(() => document.activeElement?.blur());
      await page.mouse.move(0, 0);
      await page.clock.runFor(300);
      const skipLink = await page.locator('.skip-link').evaluate(element => ({ focused: element.matches(':focus'), bottom: element.getBoundingClientRect().bottom }));
      assert.equal(skipLink.focused, false);
      assert.ok(skipLink.bottom <= 0, `Unfocused skip link must stay off screen: ${JSON.stringify(skipLink)}`);
      if (width !== 320) await tracker.screenshot({ path: fileURLToPath(new URL(`${width}-${theme}-pending.png`, output)), animations: 'disabled' });

      for (const [providerState, title] of [['reconciliation_required', 'Refund being verified'], ['failed', 'Refund needs attention'], ['processed', 'Refund confirmed']]) {
        state.requests[0].gateway_refund.state = providerState;
        if (providerState === 'processed') state.requests[0].order = { payment_status: 'refunded' };
        await refresh(page);
        await expect(tracker.getByRole('heading', { name: title, exact: true })).toBeVisible();
      }
      await expect(page.getByText(/Payment refunded/)).toBeVisible();
      await expect(tracker.getByText(/bank may take additional time/)).toBeVisible();
      const settledReads = state.reads;
      await page.clock.fastForward(65000);
      assert.equal(state.reads, settledReads, 'completed refunds must stop polling');
      if (width === 1440 && theme === 'dark') await tracker.screenshot({ path: fileURLToPath(new URL('desktop-dark-confirmed.png', output)), animations: 'disabled' });

      state.requests = [{ ...request, gateway_refund: null, refund_destination: 'store_credit', credit_approval_status: 'pending' }];
      await refresh(page);
      await expect(tracker.getByRole('heading', { name: 'Waiting for credit approval', exact: true })).toBeVisible();
      state.requests[0].credit_approval_status = 'credited';
      await refresh(page);
      await expect(tracker.getByRole('heading', { name: 'Store credits issued', exact: true })).toBeVisible();
      for (const status of ['rejected', 'cancelled']) {
        state.requests = [{ ...request, gateway_refund: null, status, returned_at: null }];
        await refresh(page);
        await expect(tracker.getByText('Request closed', { exact: true })).toBeVisible();
      }
      assert.deepEqual(state.writes, [], 'status reads must never trigger a financial write');
      console.log(`PASS states, confirmed split, IST, read-only, overflow, accessibility ${width}/${theme}`);
    } finally { await context.close(); }
  }
  const { context, page, state } = await fixture(390, 'dark');
  try {
    await page.clock.fastForward(61000);
    await expect.poll(() => state.reads).toBe(2);
    await page.evaluate(() => { window.__refundTestVisibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
    const hiddenReads = state.reads;
    await page.clock.fastForward(180000);
    assert.equal(state.reads, hiddenReads, 'hidden tabs must pause reads');
    await page.evaluate(() => { window.__refundTestVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(() => state.reads).toBe(hiddenReads + 1);
    state.status = 500;
    await refresh(page);
    await expect(page.getByRole('alert')).toContainText('last known update');
    await expect(page.getByRole('heading', { name: 'Provider processing', exact: true })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByRole('button', { name: 'Refresh updates', exact: true })).toBeDisabled();
    state.status = 200;
    await context.setOffline(false);
    await expect(page.getByRole('alert')).toHaveCount(0);
    state.requests = [];
    await refresh(page);
    await page.getByRole('button', { name: 'Return / Refund', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await dialog.getByLabel('Refund destination').selectOption('store_credit');
    await expect(dialog.getByText(/authorised admin approves/)).toBeVisible();
    assert.doesNotMatch(await dialog.innerText(), /· instant/);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Return / Refund', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Return / Refund', exact: true }).click();
    await dialog.getByLabel('Reason').fill('The size does not fit.');
    await dialog.getByRole('button', { name: 'Submit request', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Request sent', exact: true })).toBeVisible();
    assert.equal(state.writes.length, 1);
    assert.equal(state.writes[0].path, '/api/orders/local-order/returns');
    assert.equal(state.writes[0].body.type, 'return_refund');
    await page.getByRole('button', { name: 'Get refund help', exact: true }).click();
    await expect(page.getByLabel('Order number')).toHaveValue(order.order_number);
    await expect(page.getByLabel('Subject')).toHaveValue('Help with my refund');
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(/return-local-customer-reference/);
    await page.goto(base + '/orders');
    await expect(page.getByRole('heading', { name: 'Request sent', exact: true })).toBeVisible();
    state.status = 401;
    await page.getByRole('button', { name: 'Refresh updates', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in again', exact: true })).toBeVisible();
    await expect(page.locator('.account-order-card')).toHaveCount(0);
    const expiredReads = state.reads;
    await page.clock.fastForward(180000);
    assert.equal(state.reads, expiredReads);
    console.log('PASS active polling, hidden pause/resume, failures, offline, request form, keyboard, expired session');
  } finally { await context.close(); }
  assert.deepEqual(errors, [], 'No React runtime errors');
} finally { await browser.close(); }
