// Actual invoice renderer + isolated SQLite, with browser requests served from
// local assets only. No production account/order or gateway is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

test('invoice preview stays responsive and its print action works with strict CSP', async t => {
  const { db, env } = localDatabase();
  t.after(() => db.close());
  const items = [{ name: 'Night suit', size: 'M', color: 'Sage green', quantity: 2,
    price: 949, hsn_sac_code: '6108', gst_rate: 5, gst_tax_inclusive: true }];
  db.prepare(`INSERT INTO orders(id,order_number,customer_email,customer_name,items_json,
    subtotal,discount,total,payable_total,status,payment_method,payment_status,shipping_json)
    VALUES ('invoice-qa','GM-20261001-000001','preview@example.com','Aarav Sharma',?,1898,98,1800,1800,
    'confirmed','razorpay','paid',?)`).run(JSON.stringify(items), JSON.stringify({
    line1: '24 Example Lane', line2: 'Apartment 302', city: 'New Delhi', state: 'Delhi', pin: '110001', country: 'India',
  }));
  const worker = await workerFunctions(['orderInvoiceResponse']);
  const response = await worker.orderInvoiceResponse(env, { role: 'admin' }, 'invoice-qa');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const html = await response.text();
  assert.ok(html.includes('id="invoice-print"'));
  assert.ok(html.includes('src="/invoice.js"'));
  assert.ok(html.includes('src="/glamia-g-favicon.png"'));
  assert.ok(!html.includes('onclick='));
  assert.ok(!html.includes('<style>'));
  assert.ok(!html.includes('style="'));
  const browser = await chromium.launch();
  t.after(() => browser.close());
  await mkdir('tmp/pdfs', { recursive: true });
  const assets = new Map([
    ['/invoice.css', { body: await readFile('public/invoice.css'), type: 'text/css' }],
    ['/invoice.js', { body: await readFile('public/invoice.js'), type: 'application/javascript' }],
    ['/glamia-g-favicon.png', { body: await readFile('public/glamia-g-favicon.png'), type: 'image/png' }],
    ['/fonts/NotoSans-Regular.ttf', { body: await readFile('public/fonts/NotoSans-Regular.ttf'), type: 'font/ttf' }],
  ]);
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(() => { window.print = () => { window.invoicePrintCalled = true; }; });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'invoice-preview.test') return route.abort();
      if (url.pathname === '/') return route.fulfill({ body: html, contentType: 'text/html', headers: {
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; object-src 'none'",
      } });
      const asset = assets.get(url.pathname);
      return asset ? route.fulfill({ body: asset.body, contentType: asset.type }) : route.fulfill({ status: 404 });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://invoice-preview.test/');
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.getByAltText('Glamia logo').evaluate(img => img.complete && img.naturalWidth > 0), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    await page.getByRole('button', { name: 'Print / save PDF', exact: true }).click();
    assert.equal(await page.evaluate(() => window.invoicePrintCalled), true);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `tmp/pdfs/glamia-invoice-${width}.png`, fullPage: true });
    if (width === 1280) await page.pdf({ path: 'tmp/pdfs/glamia-invoice-print.pdf', format: 'A4', preferCSSPageSize: true });
    await context.close();
  }
});

test('confirmation metadata uses issued bills only and downloads the branded PDF privately', async t => {
  const { db, env } = localDatabase();
  t.after(() => db.close());
  env.ASSETS = { fetch: async request => {
    const path = new URL(request.url).pathname;
    assert.ok(['/fonts/NotoSans-Regular.ttf', '/glamia-g-favicon.png'].includes(path));
    return new Response(await readFile('public' + path));
  } };
  const worker = await workerFunctions(['formatPaymentOrder', 'orderBillResponse']);
  for (const [index, method] of ['razorpay', 'phonepe', 'store_credit'].entries()) {
    const id = `brand-bill-${index}`;
    db.prepare(`INSERT INTO orders(id,order_number,customer_email,customer_name,items_json,subtotal,total,
      payable_total,status,payment_method,payment_status,tracking_token,created_at)
      VALUES (?,?,'preview@example.com','Aarav Sharma','[]',500,500,500,'confirmed',?,'paid',?,CURRENT_TIMESTAMP)`)
      .run(id, `GM-BRAND-${index}`, method, `private-fixture-token-${index}`);
    const row = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    const formatted = await worker.formatPaymentOrder(env, row);
    assert.equal(formatted.bill_available, true);
    assert.ok(formatted.bill_number);
    const denied = await worker.orderBillResponse(env, null, id);
    assert.equal(denied.status, 404);
    const response = await worker.orderBillResponse(env, null, id, `private-fixture-token-${index}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.match(response.headers.get('content-disposition'), /attachment/);
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
    db.prepare('DELETE FROM order_bills WHERE order_id=?').run(id);
    assert.equal((await worker.formatPaymentOrder(env, row)).bill_available, false);
  }
});
