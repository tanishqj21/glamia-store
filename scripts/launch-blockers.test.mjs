// No real gateway requests. Real Worker code + real migrations + deterministic
// provider transport fixtures exercise the financial launch invariants.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

function fixture(t, provider = 'razorpay') {
  const { db, env } = localDatabase(); t.after(() => db.close());
  Object.assign(env, { RAZORPAY_KEY_ID: 'local-key', RAZORPAY_KEY_SECRET: 'local-secret', RAZORPAY_WEBHOOK_SECRET: 'local-webhook', PUBLIC_SITE_URL: 'https://glamiastore.com' });
  db.prepare(`INSERT INTO orders(id,order_number,checkout_token,customer_email,customer_name,items_json,subtotal,total,payable_total,status,payment_method,payment_gateway,payment_status,shipping_json)
    VALUES ('launch-order','GM-LAUNCH-1','launch-checkout-000001','buyer@example.com','Buyer','[]',500,500,500,'pending',?,?,'pending','{}')`).run(provider, provider);
  return { db, env, read: () => db.prepare("SELECT * FROM orders WHERE id='launch-order'").get() };
}
const checkoutBody = { checkout_token: 'launch-checkout-000001', email: 'buyer@example.com', payment_method: 'razorpay', items: [{ id: 'seed-ivory-linen-shirt', quantity: 1, size: 'M' }], address: { name: 'Buyer', phone: '9990116600', line1: '12 Test Road', city: 'New Delhi', state: 'Delhi', pin: '110037', country: 'India' } };
const request = body => new Request('https://glamiastore.com/api/payments/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('twenty concurrent requests create exactly one payable provider order and reuse its reference', async t => {
  const { db, env, read } = fixture(t); let creates = 0;
  const worker = await workerFunctions(['createGatewayPayment'], { fetch: async () => { creates++; await new Promise(resolve => setTimeout(resolve, 20)); return Response.json({ id: 'order_provider_1', amount: 50000, currency: 'INR' }); } });
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => worker.createGatewayPayment(request(checkoutBody), env, null)));
  assert.equal(creates, 1); assert.ok(results.some(result => result.status === 'fulfilled'));
  for (const result of results) if (result.status === 'rejected') assert.equal(result.reason.status, 409);
  assert.equal(read().gateway_order_id, 'order_provider_1'); assert.equal(read().payment_creation_state, 'ready');
  const again = await worker.createGatewayPayment(request(checkoutBody), env, null);
  assert.equal((await again.json()).payment.order_id, 'order_provider_1'); assert.equal(creates, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1);
});

test('ambiguous creation failure retains its claim, order and reservation; retry never POSTs again', async t => {
  const { db, env, read } = fixture(t); let creates = 0;
  const worker = await workerFunctions(['createGatewayPayment'], { fetch: async () => { creates++; throw new Error('Simulated timeout after provider acceptance'); } });
  await assert.rejects(worker.createGatewayPayment(request(checkoutBody), env, null), /timeout/);
  assert.equal(read().payment_creation_state, 'uncertain'); assert.equal(read().status, 'pending');
  for (let retry = 0; retry < 3; retry++) await assert.rejects(worker.createGatewayPayment(request(checkoutBody), env, null), error => error.status === 409);
  assert.equal(creates, 1); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_stock_releases').get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_notifications WHERE dedupe_key LIKE 'payment-creation:%'").get().n, 1);
});

test('provider response with wrong amount cannot open checkout or release an uncertain reservation', async t => {
  const { env, read } = fixture(t);
  const worker = await workerFunctions(['createGatewayPayment'], { fetch: async () => Response.json({ id: 'wrong-amount', amount: 1, currency: 'INR' }) });
  await assert.rejects(worker.createGatewayPayment(request(checkoutBody), env, null), error => error.status === 502);
  assert.equal(read().payment_creation_state, 'uncertain'); assert.equal(read().gateway_order_id, null);
});

test('closed checkout token is never silently replaced with a new order token', async t => {
  const { db, env } = fixture(t); db.exec("UPDATE orders SET status='cancelled',payment_status='failed'");
  const worker = await workerFunctions(['createGatewayPayment']);
  for (let retry = 0; retry < 3; retry++) await assert.rejects(worker.createGatewayPayment(request(checkoutBody), env, null), error => error.status === 409);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1);
});

test('gateway checkout requires a stable client token before creating any order', async t => {
  const { db, env } = fixture(t); const worker = await workerFunctions(['createGatewayPayment']);
  await assert.rejects(worker.createGatewayPayment(request({ ...checkoutBody, checkout_token: '' }), env, null), error => error.status === 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1);
});

test('paid order is returned as paid, never another payable checkout', async t => {
  const { db, env } = fixture(t); db.exec("UPDATE orders SET payment_status='paid',status='confirmed',gateway_order_id='existing'");
  const worker = await workerFunctions(['createGatewayPayment']);
  const result = await (await worker.createGatewayPayment(request(checkoutBody), env, null)).json();
  assert.equal(result.payment_status, 'paid'); assert.equal(result.payment, undefined);
  assert.equal(result.order.bill_available, true);
  assert.ok(result.order.bill_number);
});

test('all admin roles are denied manual payment-state/reference changes and unpaid fulfilment', async t => {
  const { env, read } = fixture(t); const worker = await workerFunctions(['updateOrderStatus']);
  for (const actor of [{ email: 'owner@example.com', is_owner: true }, { email: 'staff@example.com', role: 'manager' }]) {
    for (const body of [{ payment_status: 'paid' }, { payment_status: 'refunded' }, { payment_reference: 'forged' }]) {
      assert.equal((await worker.updateOrderStatus(request(body), env, 'launch-order', actor)).status, 403);
    }
    assert.equal((await worker.updateOrderStatus(request({ status: 'shipped' }), env, 'launch-order', actor)).status, 409);
  }
  assert.equal(read().payment_status, 'pending');
});

test('original-payment refunds cannot be marked refunded without provider execution', async t => {
  const { db, env } = fixture(t);
  db.prepare("INSERT INTO return_requests(id,order_id,customer_email,type,reason,status,refund_destination,refund_amount) VALUES ('launch-return','launch-order','buyer@example.com','refund','Test return','received','original',500)").run();
  const worker = await workerFunctions(['updateReturnRequest', 'getReturnRequest']);
  assert.equal((await worker.updateReturnRequest(request({ status: 'refunded' }), env, { role: 'admin', is_owner: true, email: 'owner@example.com' }, 'launch-return')).status, 409);
  assert.equal((await worker.getReturnRequest(env, 'launch-return')).refund_state, 'awaiting_owner_refund_approval');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM store_credit_ledger').get().n, 0);
});

for (const bad of [{ id: 'other-payment' }, { currency: undefined }, { currency: 'USD' }, { order_id: 'other-order' }, { amount: 49999 }]) {
  test(`server verification rejects mismatched provider details: ${JSON.stringify(bad)}`, async t => {
    const { db, env, read } = fixture(t); db.exec("UPDATE orders SET gateway_order_id='provider-order'");
    const worker = await workerFunctions(['verifyRazorpayPayment'], { fetch: async () => Response.json({ id: 'provider-payment', order_id: 'provider-order', amount: 50000, currency: 'INR', status: 'captured', ...bad }) });
    const signature = createHmac('sha256', env.RAZORPAY_KEY_SECRET).update('provider-order|provider-payment').digest('hex');
    const body = { order_id: 'launch-order', checkout_token: checkoutBody.checkout_token, razorpay_payment_id: 'provider-payment', razorpay_order_id: 'provider-order', razorpay_signature: signature };
    try { const response = await worker.verifyRazorpayPayment(request(body), env, null); assert.equal(response.status, 400); } catch (error) { assert.equal(error.status, 422); }
    assert.equal(read().payment_status, 'pending');
  });
}

test('signed late capture recovers a timed-out creation mapping, alerts once and never revives cancelled order', async t => {
  const { db, env, read } = fixture(t); db.exec("UPDATE orders SET payment_creation_state='uncertain',payment_creation_claim='claim',status='cancelled',payment_status='failed'");
  const worker = await workerFunctions(['handleRazorpayWebhook']);
  const payload = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'late-capture', order_id: 'late-provider-order', amount: 50000, currency: 'INR', status: 'captured', notes: { glamia_order_id: 'launch-order' } } } } });
  const hook = () => new Request('https://glamiastore.com/webhook', { method: 'POST', body: payload, headers: { 'X-Razorpay-Signature': createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(payload).digest('hex') } });
  for (let retry = 0; retry < 2; retry++) assert.equal((await worker.handleRazorpayWebhook(hook(), env)).status, 200);
  assert.equal(read().gateway_order_id, 'late-provider-order'); assert.equal(read().gateway_payment_id, 'late-capture'); assert.equal(read().status, 'cancelled');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_notifications WHERE dedupe_key LIKE 'late-payment:%'").get().n, 1);
});

test('unknown authenticated capture is preserved durably and surfaced for reconciliation', async t => {
  const { db, env } = fixture(t); const worker = await workerFunctions(['handleRazorpayWebhook']);
  const payload = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'unmapped', order_id: 'unknown-order', amount: 50000, currency: 'INR', status: 'captured' } } } });
  const hook = () => new Request('https://glamiastore.com/webhook', { method: 'POST', body: payload, headers: { 'X-Razorpay-Signature': createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(payload).digest('hex') } });
  for (let retry = 0; retry < 2; retry++) await worker.handleRazorpayWebhook(hook(), env);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM payment_reconciliation_events').get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_notifications WHERE dedupe_key LIKE 'unmapped-payment:%'").get().n, 1);
});

test('concurrent financial email deliveries contact Brevo once; ambiguous timeout is not retried', async t => {
  const { db, env } = fixture(t); Object.assign(env, { BREVO_API_KEY: 'fixture-key', BREVO_FROM_EMAIL: 'fixture@example.com' }); let sends = 0;
  const worker = await workerFunctions(['deliverBrevoEmail'], { fetch: async () => { sends++; await new Promise(resolve => setTimeout(resolve, 15)); throw new Error('Ambiguous delivery timeout'); } });
  const email = { eventType: 'confirmation', dedupeKey: 'launch-confirmation', recipient: 'buyer@example.com', orderId: 'launch-order', payload: { subject: 'Order confirmed' } };
  await Promise.all(Array.from({ length: 10 }, () => worker.deliverBrevoEmail(env, email)));
  await worker.deliverBrevoEmail(env, email); assert.equal(sends, 1);
  assert.ok(db.prepare("SELECT delivery_claim FROM email_delivery_log WHERE dedupe_key='launch-confirmation'").get().delivery_claim);
});

test('0096 + 0097 migrate the real 0095 schema without deleting customer/order data', t => {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  const files = readdirSync(new URL('../migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort();
  for (const file of files.filter(name => Number(name.slice(0, 4)) <= 95)) db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  db.exec("INSERT INTO orders(id,customer_email,items_json,subtotal,total,status,payment_method,payment_gateway,payment_status,shipping_json,gateway_order_id) VALUES ('existing-order','buyer@example.com','[]',500,500,'pending','razorpay','razorpay','pending','{}','existing-provider')");
  const products = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  for (const file of files.filter(name => Number(name.slice(0, 4)) >= 96)) db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM products').get().n, products);
  assert.equal(db.prepare("SELECT payment_creation_state FROM orders WHERE id='existing-order'").get().payment_creation_state, 'ready');
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
});

test('real concurrent checkout reserves the last variant once; repeated callback cannot deduct stock twice', async t => {
  const { db, env } = fixture(t);
  db.exec("DELETE FROM orders; UPDATE products SET stock=1,price=500,deal_price=NULL WHERE id='seed-ivory-linen-shirt'; DELETE FROM product_sizes WHERE product_id='seed-ivory-linen-shirt'; INSERT INTO product_sizes(product_id,size,stock) VALUES ('seed-ivory-linen-shirt','M',1)");
  const worker = await workerFunctions(['createOrder', 'settleGatewayPayment', 'failGatewayOrder']);
  const bodies = [0, 1].map(index => ({ ...checkoutBody, checkout_token: `concurrent-stock-token-${index}`, total: 1, items: [{ ...checkoutBody.items[0], price: 1 }] }));
  const results = await Promise.allSettled(bodies.map(body => worker.createOrder(request(body), env, null, { allowGateway: true, body })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const winner = db.prepare('SELECT * FROM orders').get();
  assert.equal(winner.total, 500); assert.equal(db.prepare("SELECT stock FROM products WHERE id='seed-ivory-linen-shirt'").get().stock, 0);
  assert.equal(db.prepare("SELECT stock FROM product_sizes WHERE product_id='seed-ivory-linen-shirt' AND size='M'").get().stock, 0);
  const stock = () => db.prepare("SELECT stock FROM products WHERE id='seed-ivory-linen-shirt'").get().stock;
  await worker.settleGatewayPayment(env, winner, { status: 'paid', paymentId: 'verified-payment', amount: 50000 });
  await worker.settleGatewayPayment(env, winner, { status: 'paid', paymentId: 'verified-payment', amount: 50000 });
  assert.equal(stock(), 0); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_bills').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1);
});

test('same checkout token racing at initial order INSERT yields one reservation; failed payment releases exactly once', async t => {
  const { db, env } = fixture(t);
  db.exec("DELETE FROM orders; UPDATE products SET stock=5,price=500,deal_price=NULL WHERE id='seed-ivory-linen-shirt'; DELETE FROM product_sizes WHERE product_id='seed-ivory-linen-shirt'; INSERT INTO product_sizes(product_id,size,stock) VALUES ('seed-ivory-linen-shirt','M',5)");
  const worker = await workerFunctions(['createOrder', 'failGatewayOrder']);
  const results = await Promise.all([worker.createOrder(request(checkoutBody), env, null, { allowGateway: true, body: checkoutBody }), worker.createOrder(request(checkoutBody), env, null, { allowGateway: true, body: checkoutBody })]);
  const ids = await Promise.all(results.map(async response => (await response.json()).order.id)); assert.equal(ids[0], ids[1]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1);
  assert.equal(db.prepare("SELECT stock FROM products WHERE id='seed-ivory-linen-shirt'").get().stock, 4);
  await worker.failGatewayOrder(env, ids[0]); await worker.failGatewayOrder(env, ids[0]);
  assert.equal(db.prepare("SELECT stock FROM products WHERE id='seed-ivory-linen-shirt'").get().stock, 5);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_stock_releases').get().n, 1);
  const retryBody = { ...checkoutBody, checkout_token: 'new-safe-attempt-000001' };
  const retry = await worker.createOrder(request(retryBody), env, null, { allowGateway: true, body: retryBody });
  assert.equal(retry.status, 201);
  assert.equal(db.prepare("SELECT stock FROM products WHERE id='seed-ivory-linen-shirt'").get().stock, 4);
});

test('PhonePe creation timeout keeps merchant mapping and never creates a second session', async t => {
  const { env, read } = fixture(t, 'phonepe'); Object.assign(env, { PHONEPE_ENV: 'sandbox', PHONEPE_CLIENT_ID: 'fixture', PHONEPE_CLIENT_SECRET: 'fixture', PHONEPE_CLIENT_VERSION: '1' });
  let creates = 0;
  const worker = await workerFunctions(['createGatewayPayment'], { fetch: async url => {
    if (url.includes('/oauth/token')) return Response.json({ access_token: 'local-token', expires_at: Math.floor(Date.now() / 1000) + 3600 });
    creates++; throw new Error('PhonePe accepted; simulated lost response');
  } });
  const body = { ...checkoutBody, payment_method: 'phonepe' };
  await assert.rejects(worker.createGatewayPayment(request(body), env, null));
  assert.equal(read().gateway_order_id, 'PP-launchorder'); assert.equal(read().payment_creation_state, 'uncertain');
  await assert.rejects(worker.createGatewayPayment(request(body), env, null), error => error.status === 409);
  assert.equal(creates, 1);
});

test('PhonePe HMAC headers verify callbacks, use root state, and duplicate completion is harmless', async t => {
  const { db, env, read } = fixture(t, 'phonepe'); Object.assign(env, { PHONEPE_WEBHOOK_SECRET: 'phonepe-local-secret', PHONEPE_WEBHOOK_ID: 'phonepe-local-id' });
  db.exec("UPDATE orders SET gateway_order_id='merchant-order',payment_creation_state='ready'");
  const worker = await workerFunctions(['handlePhonePeWebhook']);
  const hook = state => {
    const payload = JSON.stringify({ event: 'checkout.order.completed', payload: { merchantOrderId: 'merchant-order', state, amount: 50000, paymentDetails: [{ transactionId: 'phonepe-payment', state: 'COMPLETED' }] } });
    return new Request('https://glamiastore.com/webhook', { method: 'POST', body: payload, headers: { 'x-phonepe-checksum-key-id': env.PHONEPE_WEBHOOK_ID, 'x-phonepe-checksum-signature': createHmac('sha256', env.PHONEPE_WEBHOOK_SECRET).update(payload).digest('hex') } });
  };
  await worker.handlePhonePeWebhook(hook('PENDING'), env); assert.equal(read().payment_status, 'pending');
  for (let duplicate = 0; duplicate < 2; duplicate++) await worker.handlePhonePeWebhook(hook('COMPLETED'), env);
  assert.equal(read().payment_status, 'paid'); assert.equal(read().gateway_payment_id, 'phonepe-payment');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_bills').get().n, 1);
  const forged = await worker.handlePhonePeWebhook(new Request('https://glamiastore.com/webhook', { method: 'POST', body: '{}' }), env); assert.equal(forged.status, 401);
});

test('unique provider references prevent one session from being mapped to two internal orders', t => {
  const { db } = fixture(t); db.exec("UPDATE orders SET gateway_order_id='same-provider'");
  assert.throws(() => db.exec("INSERT INTO orders(id,customer_email,items_json,subtotal,total,status,payment_method,payment_gateway,payment_status,shipping_json,gateway_order_id) VALUES ('duplicate-reference','buyer@example.com','[]',500,500,'pending','razorpay','razorpay','pending','{}','same-provider')"), /UNIQUE constraint/);
});

test('order documents and payment tokens do not grant another customer access', async t => {
  const { db, env, read } = fixture(t);
  db.exec("UPDATE orders SET payment_status='paid',status='confirmed',gateway_order_id='private-session',tracking_token='private-tracking-token'");
  const worker = await workerFunctions(['orderInvoiceResponse', 'orderBillResponse', 'paymentOrderForRequest', 'authorizeEmployeeWebsiteRequest']);
  const stranger = { email: 'other@example.com', role: 'seller' };
  assert.equal((await worker.orderInvoiceResponse(env, stranger, read().id)).status, 404);
  assert.equal((await worker.orderBillResponse(env, stranger, read().id)).status, 404);
  assert.equal((await worker.orderBillResponse(env, null, read().id, 'wrong-token')).status, 404);
  assert.equal(await worker.paymentOrderForRequest(request({}), env, stranger, read().id, checkoutBody.checkout_token), null);
  assert.equal(await worker.paymentOrderForRequest(request({}), env, null, read().id, 'wrong-token'), null);
  const endpoint = new URL('https://glamiastore.com/api/orders/launch-order/bill');
  await assert.rejects(worker.authorizeEmployeeWebsiteRequest(new Request(endpoint), endpoint, { employee_permissions: { storefront: true } }), error => error.status === 403);
});

test('another customer cannot read, edit or delete an address by changing its ID', async t => {
  const { db, env } = fixture(t); const worker = await workerFunctions(['createAddress', 'listAddresses', 'updateAddress', 'deleteAddress']);
  const owner = { email: 'buyer@example.com' }, stranger = { email: 'other@example.com' };
  const created = await (await worker.createAddress(request(checkoutBody.address), env, owner)).json();
  const id = created.addresses[0].id;
  assert.deepEqual((await (await worker.listAddresses(env, stranger)).json()).addresses, []);
  await assert.rejects(worker.updateAddress(request(checkoutBody.address), env, stranger, id), error => error.status === 404);
  await assert.rejects(worker.deleteAddress(env, stranger, id), error => error.status === 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_addresses WHERE user_email=?').get(owner.email).n, 1);
});

test('valid Razorpay verification and duplicate signed capture produce one bill and one financial email', async t => {
  const { db, env, read } = fixture(t);
  Object.assign(env, { BREVO_API_KEY: 'fixture-key', BREVO_FROM_EMAIL: 'fixture@example.com' });
  db.exec("UPDATE orders SET gateway_order_id='provider-order',payment_creation_state='ready'");
  let sent = 0;
  const worker = await workerFunctions(['verifyRazorpayPayment', 'handleRazorpayWebhook'], { fetch: async url => {
    if (url.includes('brevo.com')) { sent++; return Response.json({ messageId: 'one-financial-email' }); }
    return Response.json({ id: 'provider-payment', order_id: 'provider-order', amount: 50000, currency: 'INR', status: 'captured' });
  } });
  const body = { order_id: 'launch-order', checkout_token: checkoutBody.checkout_token, razorpay_payment_id: 'provider-payment', razorpay_order_id: 'provider-order', razorpay_signature: createHmac('sha256', env.RAZORPAY_KEY_SECRET).update('provider-order|provider-payment').digest('hex') };
  assert.equal((await (await worker.verifyRazorpayPayment(request(body), env, null)).json()).payment_status, 'paid');
  const payload = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'provider-payment', order_id: 'provider-order', amount: 50000, currency: 'INR', status: 'captured' } } } });
  const hook = () => new Request('https://glamiastore.com/webhook', { method: 'POST', body: payload, headers: { 'X-Razorpay-Signature': createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(payload).digest('hex') } });
  await Promise.all([worker.handleRazorpayWebhook(hook(), env), worker.handleRazorpayWebhook(hook(), env)]);
  assert.equal(read().gateway_payment_id, 'provider-payment'); assert.equal(sent, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_bills').get().n, 1);
});
