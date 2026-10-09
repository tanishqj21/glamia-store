// node --experimental-vm-modules --experimental-sqlite --test scripts/production-hardening.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

function orderFixture() {
  const { db, env } = localDatabase();
  db.prepare("INSERT INTO orders(id,customer_email,customer_name,items_json,subtotal,total,payable_total,status,payment_method,payment_gateway,payment_status,shipping_json) VALUES ('audit-payment','buyer@example.com','Buyer','[]',500,500,500,'pending','razorpay','razorpay','pending','{}')").run();
  const read = () => db.prepare("SELECT * FROM orders WHERE id='audit-payment'").get();
  return { db, env, read };
}

test('stale failure cannot release stock or cancel an already captured payment', async t => {
  const { db, env, read } = orderFixture(); t.after(() => db.close());
  const stale = read();
  db.prepare("UPDATE orders SET payment_status='paid',status='confirmed' WHERE id=?").run(stale.id);
  const worker = await workerFunctions(['settleGatewayPayment']);
  await worker.settleGatewayPayment(env, stale, { status: 'failed', amount: 50000 });
  assert.equal(read().payment_status, 'paid');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_stock_releases').get().n, 0);
});

test('stale authorization and capture cannot downgrade paid or revive refunded payments', async t => {
  const { db, env, read } = orderFixture(); t.after(() => db.close());
  const stale = read();
  const worker = await workerFunctions(['settleGatewayPayment']);
  db.prepare("UPDATE orders SET payment_status='paid',status='confirmed' WHERE id=?").run(stale.id);
  await worker.settleGatewayPayment(env, stale, { status: 'authorized', amount: 50000 });
  assert.equal(read().payment_status, 'paid');
  db.prepare("UPDATE orders SET payment_status='refunded' WHERE id=?").run(stale.id);
  await worker.settleGatewayPayment(env, stale, { status: 'paid', amount: 50000 });
  assert.equal(read().payment_status, 'refunded');
});

test('successful settlement rejects missing, fractional or mismatched paise amounts', async t => {
  const { db, env, read } = orderFixture(); t.after(() => db.close());
  const worker = await workerFunctions(['settleGatewayPayment']);
  for (const amount of [null, undefined, 49999, 50000.5, NaN]) {
    await assert.rejects(worker.settleGatewayPayment(env, read(), { status: 'paid', amount }), error => error.status === 422);
    assert.equal(read().payment_status, 'pending');
  }
});

test('failed gateway cancellation releases stock and coupon usage only once', async t => {
  const { db, env, read } = orderFixture(); t.after(() => db.close());
  const worker = await workerFunctions(['failGatewayOrder']);
  await worker.failGatewayOrder(env, read().id);
  await worker.failGatewayOrder(env, read().id);
  assert.equal(read().status, 'cancelled');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_stock_releases').get().n, 1);
});

test('mixed preorder cancellation restores physical stock only for regular lines', t => {
  const { db } = localDatabase(); t.after(() => db.close());
  const regular = 'seed-ivory-linen-shirt', preorder = 'seed-midnight-satin-dress';
  db.prepare('UPDATE products SET stock=5,preorder_enabled=1,preorder_sold=2 WHERE id=?').run(preorder);
  db.prepare('UPDATE products SET stock=5 WHERE id=?').run(regular);
  const items = JSON.stringify([{ id: regular, quantity: 1, size: 'M', preorder: false }, { id: preorder, quantity: 2, size: 'M', preorder: true }]);
  db.prepare("INSERT INTO orders(id,customer_email,items_json,subtotal,total,status,payment_method,payment_status,shipping_json,order_type) VALUES ('mixed','buyer@example.com',?,500,500,'pending','razorpay','pending','{}','preorder')").run(items);
  for (const [product, quantity] of [[regular, 1], [preorder, 2]]) db.prepare('INSERT INTO order_items(id,order_id,product_id,product_name,unit_price,quantity,size) VALUES (?,?,?,?,?,?,?)').run(product, 'mixed', product, 'Product', 100, quantity, 'M');
  db.prepare('INSERT INTO order_stock_releases(order_id) VALUES (?)').run('mixed');
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get(regular).stock, 6);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get(preorder).stock, 5);
  assert.equal(db.prepare('SELECT preorder_sold FROM products WHERE id=?').get(preorder).preorder_sold, 0);
});

test('crawler HTML and shopper HTML cannot contaminate each others edge cache', async () => {
  const saved = new Map();
  const cache = { async match(key) { return saved.get(key.url)?.clone(); }, async put(key, response) { saved.set(key.url, response); } };
  const worker = await workerFunctions(['cachedPublicResponse'], { caches: { default: cache } });
  const pending = [], ctx = { waitUntil(promise) { pending.push(promise); } };
  const response = text => new Response(text, { headers: { 'Content-Type': 'text/html' } });
  await worker.cachedPublicResponse(new Request('https://glamiastore.com/', { headers: { 'User-Agent': 'Googlebot' } }), ctx, 60, () => response('crawler'));
  await Promise.all(pending);
  const human = await worker.cachedPublicResponse(new Request('https://glamiastore.com/', { headers: { 'User-Agent': 'Mozilla/5.0' } }), ctx, 60, () => response('interactive'));
  assert.equal(await human.text(), 'interactive');
});

test('signed webhook readers bound streamed bodies and report malformed JSON', async () => {
  const worker = await workerFunctions(['handleRazorpayWebhook', 'parseWebhookJson']);
  const env = { RAZORPAY_WEBHOOK_SECRET: 'local-only-fixture' };
  await assert.rejects(worker.handleRazorpayWebhook(new Request('http://localhost/webhook', { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1) }), env), error => error.status === 413);
  for (const payload of ['{', 'null', '[]', '"string"']) assert.throws(() => worker.parseWebhookJson(payload), error => error.status === 400);
});

test('R2 cleanup fails closed on a reference read error and preserves order/bill images', async t => {
  const { db, env } = orderFixture(); t.after(() => db.close());
  const worker = await workerFunctions(['referencedR2Keys', 'addR2References']);
  db.prepare("UPDATE orders SET items_json=? WHERE id='audit-payment'").run(JSON.stringify([{ image: '/api/assets/products/history.png' }]));
  const refs = await worker.referencedR2Keys(env);
  assert.ok(refs.has('products/history.png'));
  worker.addR2References('https://glamiastore.com/api/assets/products/absolute.png?size=small', refs);
  assert.ok(refs.has('products/absolute.png'));
  const broken = { DB: { prepare() { return { async all() { throw new Error('Local simulated D1 outage'); } }; } } };
  await assert.rejects(worker.referencedR2Keys(broken), /simulated D1 outage/);
});

test('stale admin edits cannot overwrite capture or reopen a concurrently cancelled order', async t => {
  const { db, env, read } = orderFixture(); t.after(() => db.close());
  const worker = await workerFunctions(['updateOrderStatus']);
  const prepare = env.DB.prepare;
  let race = "payment_status='paid',status='confirmed'";
  env.DB.prepare = sql => {
    const statement = prepare(sql);
    if (sql === 'SELECT * FROM orders WHERE id = ?') {
      const first = statement.first;
      statement.first = async () => { const snapshot = await first(); if (race) { db.exec(`UPDATE orders SET ${race} WHERE id='audit-payment'`); race = null; } return snapshot; };
    }
    return statement;
  };
  const request = status => new Request('http://localhost/order', { method: 'PATCH', body: JSON.stringify({ status }) });
  assert.equal((await worker.updateOrderStatus(request('cancelled'), env, read().id)).status, 409);
  assert.equal(read().payment_status, 'paid');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_stock_releases').get().n, 0);
  race = "status='cancelled'";
  assert.equal((await worker.updateOrderStatus(request('shipped'), env, read().id)).status, 409);
  assert.equal(read().status, 'cancelled');
});

test('normal admin cancellation still commits its stock release in the same transaction', async t => {
  const { db, env, read } = orderFixture(); t.after(() => db.close());
  const worker = await workerFunctions(['updateOrderStatus']);
  const response = await worker.updateOrderStatus(new Request('http://localhost/order', { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) }), env, read().id);
  assert.equal(response.status, 200);
  assert.equal(read().status, 'cancelled');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_stock_releases').get().n, 1);
});

test('expiry fetches captured provider payments before cancelling, preserving stock on provider failures', async t => {
  const { db, env, read } = orderFixture(); t.after(() => db.close());
  Object.assign(env, { RAZORPAY_KEY_ID: 'local', RAZORPAY_KEY_SECRET: 'fixture' });
  db.prepare("UPDATE orders SET gateway_order_id='provider-order' WHERE id='audit-payment'").run();
  let fail = true;
  const worker = await workerFunctions(['reconcileExpiringGatewayOrder'], { fetch: async () => {
    if (fail) throw new Error('Simulated provider outage');
    return new Response(JSON.stringify({ items: [{ id: 'capture', order_id: 'provider-order', currency: 'INR', amount: 50000, status: 'captured' }] }));
  } });
  await assert.rejects(worker.reconcileExpiringGatewayOrder(env, read()), /provider outage/);
  assert.equal(read().status, 'pending');
  fail = false;
  await worker.reconcileExpiringGatewayOrder(env, read());
  assert.equal(read().payment_status, 'paid');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_stock_releases').get().n, 0);
});

test('capture after cancellation alerts orders staff once without resurrecting the order', async t => {
  const { db, env, read } = orderFixture(); t.after(() => db.close());
  db.prepare("UPDATE orders SET status='cancelled',payment_status='failed' WHERE id='audit-payment'").run();
  const worker = await workerFunctions(['settleGatewayPayment']);
  for (let i = 0; i < 2; i++) await worker.settleGatewayPayment(env, read(), { status: 'paid', amount: 50000, paymentId: 'late-capture' });
  assert.equal(read().status, 'cancelled');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_notifications WHERE dedupe_key LIKE 'late-payment:%'").get().n, 1);
});

test('all first-party inline boot scripts have matching restrictive CSP hashes', async () => {
  const html = readFileSync(new URL('../react-app/index.html', import.meta.url), 'utf8');
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  const worker = await workerFunctions(['withSecurityHeaders']);
  const csp = worker.withSecurityHeaders(new Response()).headers.get('Content-Security-Policy');
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    const hash = `sha256-${createHash('sha256').update(script).digest('base64')}`;
    assert.ok(csp.includes(hash));
    assert.ok(headers.includes(hash));
  }
  assert.ok(!csp.includes("'unsafe-inline'"));
});

test('product and checkout amounts remain exact when converted to paise', async t => {
  const { db, env } = localDatabase(); t.after(() => db.close());
  const worker = await workerFunctions(['validateMoney', 'createOrder']);
  assert.equal(worker.validateMoney(949, 'Price'), 949);
  assert.throws(() => worker.validateMoney(Number.MAX_SAFE_INTEGER, 'Price'), error => error.status === 400);
  const price = Math.floor(Number.MAX_SAFE_INTEGER / 100);
  db.prepare("UPDATE products SET price=?,stock=20,sizes_json='[]' WHERE id='seed-ivory-linen-shirt'").run(price);
  const body = { checkout_token: 'amount-check-attempt-0001', email: 'buyer@example.com', payment_method: 'razorpay', items: [{ id: 'seed-ivory-linen-shirt', quantity: 2 }], address: { name: 'Local buyer', phone: '+919876543210', line1: '123 Test Road', city: 'New Delhi', state: 'Delhi', pin: '110001', country: 'India' } };
  await assert.rejects(worker.createOrder(new Request('http://localhost/api/orders'), env, null, { allowGateway: true, body }), error => error.status === 400 && /supported checkout amount/.test(error.message));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0);
});

test('retention rechecks payment eligibility before deleting child records', async t => {
  const { db, env, read } = orderFixture(); t.after(() => db.close());
  db.prepare("UPDATE orders SET status='cancelled',payment_status='failed',updated_at=datetime('now','-30 days') WHERE id='audit-payment'").run();
  db.prepare("INSERT INTO order_items(id,order_id,product_id,product_name,unit_price,quantity) VALUES ('retained-line','audit-payment','seed-ivory-linen-shirt','Product',500,1)").run();
  const originalBatch = env.DB.batch;
  env.DB.batch = statements => {
    db.prepare("UPDATE orders SET payment_status='paid',status='confirmed' WHERE id='audit-payment'").run();
    return originalBatch(statements);
  };
  const worker = await workerFunctions(['purgeExpiredPaymentOrders']);
  await worker.purgeExpiredPaymentOrders(env);
  assert.equal(read().payment_status, 'paid');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_items WHERE order_id='audit-payment'").get().n, 1);
});

test('retention preserves late-capture alerts but removes genuinely expired failures', async t => {
  const { db, env, read } = orderFixture(); t.after(() => db.close());
  db.prepare("UPDATE orders SET status='cancelled',payment_status='failed',updated_at=datetime('now','-30 days') WHERE id='audit-payment'").run();
  const worker = await workerFunctions(['purgeExpiredPaymentOrders', 'notifyLateGatewayPayment']);
  await worker.notifyLateGatewayPayment(env, read(), 'provider-capture');
  await worker.purgeExpiredPaymentOrders(env);
  assert.ok(read());
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_notifications WHERE order_id='audit-payment'").get().n, 1);
  db.prepare("DELETE FROM admin_notifications WHERE order_id='audit-payment'").run();
  await worker.purgeExpiredPaymentOrders(env);
  assert.equal(read().gateway_payment_id, 'provider-capture');
  db.prepare("UPDATE orders SET gateway_payment_id=NULL WHERE id='audit-payment'").run();
  await worker.purgeExpiredPaymentOrders(env);
  assert.equal(read(), undefined);
});
