import test from 'node:test';
import assert from 'node:assert/strict';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

const owner = { role: 'admin', is_owner: true, email: 'owner@example.com' };
async function fixture(t, { provider = 'razorpay', total = 400, credits = 0 } = {}) {
  const { db, env } = localDatabase(); t.after(() => db.close());
  Object.assign(env, { ADMIN_EMAILS: [owner.email], GATEWAY_REFUNDS_ENABLED: 'true', AUTOMATIC_GATEWAY_REFUNDS_ENABLED: 'true',
    RAZORPAY_KEY_ID: 'local', RAZORPAY_KEY_SECRET: 'local', PHONEPE_CLIENT_ID: 'local', PHONEPE_CLIENT_SECRET: 'local',
    PHONEPE_CLIENT_VERSION: '1', PHONEPE_ENV: 'sandbox', DISABLE_OUTBOUND_PUSH: 'true' });
  db.prepare("INSERT INTO users(google_sub,email,name,role) VALUES('auto','buyer@example.com','Local buyer','seller')").run();
  if (credits) db.prepare("INSERT INTO store_credit_accounts(user_email,balance) VALUES('buyer@example.com',?)").run(credits);
  db.prepare(`INSERT INTO orders(id,order_number,customer_email,items_json,subtotal,total,status,payment_method,payment_status,
    credits_used,payable_total,payment_gateway,gateway_order_id,gateway_payment_id)
    VALUES('auto-order','GM-AUTO-LOCAL','buyer@example.com','[]',?,?,'delivered',?,'paid',?,?,?,'order_auto','pay_auto')`)
    .run(total, total, provider, credits, total - credits, provider);
  db.prepare(`INSERT INTO return_requests(id,order_id,customer_email,type,reason,status,refund_amount,refund_destination)
    VALUES('auto-return','auto-order','buyer@example.com','refund','Local only','approved',?,'original')`).run(Math.floor(total));
  let state = 'processed', failCreate = false, statusError = null, authRequests = 0;
  const calls = [];
  const worker = await workerFunctions(['updateReturnRequest', 'processAutomaticReturnRefund', 'processGatewayRefunds', 'gatewayRefundTransport'], {
    fetch: async (input, init = {}) => {
      const url = new URL(input);
      assert.ok(['api.razorpay.com', 'api-preprod.phonepe.com'].includes(url.hostname));
      if (url.pathname.endsWith('/oauth/token')) { authRequests++; return Response.json({ access_token: `fixture-token-${authRequests}`, expires_at: Math.floor(Date.now() / 1000) + 3600 }); }
      calls.push({ path: url.pathname, method: init.method || 'GET', body: init.body });
      if (url.pathname.endsWith('/payments/pay_auto')) return Response.json({ id: 'pay_auto', order_id: 'order_auto', currency: 'INR',
        amount: Math.round((total - credits) * 100), amount_refunded: 0, status: 'captured' });
      if (url.pathname.endsWith('/checkout/v2/order/order_auto/status')) return Response.json({ amount: Math.round((total - credits) * 100),
        state: 'COMPLETED', paymentDetails: [{ transactionId: 'pay_auto', state: 'COMPLETED' }] });
      if (init.method === 'POST') {
        if (failCreate) throw Error('Simulated lost create response');
        return Response.json(provider === 'razorpay' ? { id: 'rfnd_auto', status: 'pending' } : { refundId: 'OMRauto', amount: Math.round((total - credits) * 100), state: 'PENDING' });
      }
      if (statusError) { const error = statusError; if (error.once) statusError = null; return Response.json(error.body, { status: error.status }); }
      return Response.json(provider === 'razorpay'
        ? { id: 'rfnd_auto', entity: 'refund', currency: 'INR', payment_id: 'pay_auto', amount: Math.round((total - credits) * 100), status: state }
        : { refundId: 'OMRauto', originalMerchantOrderId: 'order_auto', amount: Math.round((total - credits) * 100), state: state === 'processed' ? 'COMPLETED' : 'PENDING' });
    }
  });
  const receive = (actor = owner, ctx, extra = {}) => worker.updateReturnRequest(new Request('https://glamiastore.com/api/admin/returns/auto-return',
    { method: 'PATCH', body: JSON.stringify({ status: 'received', ...extra }) }), env, actor, 'auto-return', ctx);
  return { db, env, worker, calls, receive, pending: () => { state = 'pending'; }, loseCreate: () => { failCreate = true; },
    error: value => { statusError = value; }, authRequests: () => authRequests };
}

for (const provider of ['razorpay', 'phonepe']) {
  test(`${provider}: owner receipt automatically sends one verified full refund without extra approval`, async t => {
    const f = await fixture(t, { provider });
    const response = await f.receive(); assert.equal(response.status, 200);
    const row = f.db.prepare('SELECT * FROM return_requests').get();
    assert.equal(row.status, 'refunded'); assert.equal(row.automatic_refund_requested_by, owner.email);
    assert.equal(row.automatic_refund_amount_paise, 40000);
    assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
    await f.worker.processAutomaticReturnRefund(f.env, 'auto-return');
    await f.worker.processGatewayRefunds(f.env);
    assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
    assert.throws(() => f.db.prepare("UPDATE return_requests SET automatic_refund_amount_paise=100").run(), /authorization/);
  });
}
test('automatic receipt uses exact full paid total, not rounded or client-supplied amount', async t => {
  const f = await fixture(t, { total: 199.99 });
  await f.receive(owner, undefined, { refund_amount: 1 });
  assert.equal(f.db.prepare('SELECT refund_amount FROM return_requests').get().refund_amount, 199.99);
  assert.equal(JSON.parse(f.calls.find(call => call.method === 'POST').body).amount, 19999);
});
test('mixed payment returns only original gateway share and restores credits once', async t => {
  const f = await fixture(t, { credits: 100 }); await f.receive();
  assert.equal(JSON.parse(f.calls.find(call => call.method === 'POST').body).amount, 30000);
  assert.equal(f.db.prepare('SELECT balance FROM store_credit_accounts').get().balance, 100);
  await f.worker.processAutomaticReturnRefund(f.env, 'auto-return');
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM store_credit_ledger WHERE kind='refund'").get().n, 1);
});
test('non-owner receipt is rejected before changing status or contacting any provider', async t => {
  const f = await fixture(t);
  for (const actor of [{ ...owner, is_owner: false }, { ...owner, email: 'other@example.com' },
    { role: 'admin', email: 'manager@example.com', employee_permissions: { returns: true } }]) {
    assert.equal((await f.receive(actor)).status, 403);
  }
  assert.equal(f.db.prepare('SELECT status FROM return_requests').get().status, 'approved'); assert.equal(f.calls.length, 0);
});
test('disabled execution and unpaid orders cannot enqueue an automatic refund', async t => {
  const f = await fixture(t); f.env.GATEWAY_REFUNDS_ENABLED = 'false'; assert.equal((await f.receive()).status, 409);
  f.env.GATEWAY_REFUNDS_ENABLED = 'true'; f.db.prepare("UPDATE orders SET payment_status='pending'").run();
  assert.equal((await f.receive()).status, 409); assert.equal(f.calls.length, 0);
});
test('store-credit receipts retain approval workflow and do not create gateway refunds', async t => {
  const f = await fixture(t); f.db.prepare("UPDATE return_requests SET refund_destination='store_credit'").run();
  assert.equal((await f.receive({ ...owner, is_owner: false })).status, 200);
  assert.equal(f.db.prepare('SELECT automatic_refund_requested_at FROM return_requests').get().automatic_refund_requested_at, null);
  assert.equal(f.calls.length, 0);
});
test('concurrent receipt requests create a single intent and one provider POST', async t => {
  const f = await fixture(t); await Promise.all([f.receive(), f.receive()]);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM gateway_refunds').get().n, 1);
});
test('background receipt processing leaves pending provider refunds uncompleted', async t => {
  const f = await fixture(t);
  const pending = []; const ctx = { waitUntil: promise => pending.push(promise) };
  f.pending(); await f.receive(owner, ctx); await Promise.all(pending);
  assert.equal(f.db.prepare('SELECT state FROM gateway_refunds').get().state, 'pending');
  assert.equal(f.db.prepare('SELECT status FROM return_requests').get().status, 'received');
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});

test('cron resumes a durable receipt intent left before provider execution', async t => {
  const f = await fixture(t);
  f.db.prepare(`UPDATE return_requests SET status='received', refund_amount=400,
    automatic_refund_requested_at=CURRENT_TIMESTAMP, automatic_refund_requested_by=?,
    automatic_refund_amount_paise=40000, automatic_refund_next_attempt_at=CURRENT_TIMESTAMP`).run(owner.email);
  await f.worker.processGatewayRefunds(f.env);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(f.db.prepare('SELECT status FROM return_requests').get().status, 'refunded');
  await f.worker.processGatewayRefunds(f.env);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});
test('cron never automatically sends historical received returns without receipt intent', async t => {
  const f = await fixture(t); f.db.prepare("UPDATE return_requests SET status='received'").run();
  await f.worker.processGatewayRefunds(f.env); assert.equal(f.calls.length, 0);
});
test('PhonePe lost POST response is checked via original merchant refund ID, never resubmitted', async t => {
  const f = await fixture(t, { provider: 'phonepe' }); f.loseCreate(); await f.receive();
  assert.equal(f.db.prepare('SELECT state FROM gateway_refunds').get().state, 'reconciliation_required');
  await f.worker.processAutomaticReturnRefund(f.env, 'auto-return');
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(f.db.prepare('SELECT state FROM gateway_refunds').get().state, 'processed');
});
test('PhonePe HTTP/status codes are retained safely and raw provider messages are never exposed', async t => {
  const f = await fixture(t, { provider: 'phonepe' });
  f.error({ status: 404, body: { code: 'REFUND_NOT_FOUND', message: 'PRIVATE TOKEN AND ACCOUNT DETAILS' } });
  await f.receive();
  const error = f.db.prepare('SELECT last_error FROM gateway_refunds').get().last_error;
  assert.match(error, /PhonePe refund status returned HTTP 404 \(REFUND_NOT_FOUND\)/);
  assert.doesNotMatch(error, /PRIVATE|TOKEN|ACCOUNT/);
  assert.equal(f.db.prepare('SELECT payment_status FROM orders').get().payment_status, 'paid');
});

test('PhonePe read-only 401 refreshes the token once and confirms without another refund POST', async t => {
  const f = await fixture(t, { provider: 'phonepe' });
  f.error({ status: 401, body: { code: 'AUTHORIZATION_FAILED' }, once: true });
  await f.receive();
  assert.equal(f.authRequests(), 2);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(f.db.prepare('SELECT state FROM gateway_refunds').get().state, 'processed');
});

test('persistent PhonePe 401 is bounded and stays unresolved, never falsely refunded', async t => {
  const f = await fixture(t, { provider: 'phonepe' });
  f.error({ status: 401, body: { code: 'AUTHORIZATION_FAILED' } });
  await f.receive();
  assert.equal(f.authRequests(), 2);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  const row = f.db.prepare('SELECT state,last_error FROM gateway_refunds').get();
  assert.equal(row.state, 'reconciliation_required'); assert.match(row.last_error, /401 \(AUTHORIZATION_FAILED\)/);
  assert.equal(f.db.prepare('SELECT payment_status FROM orders').get().payment_status, 'paid');
});

test('PhonePe refund POST receiving 401 is never repeated or silently retried', async () => {
  let posts = 0, tokens = 0;
  const worker = await workerFunctions(['gatewayRefundTransport'], { fetch: async (input, init = {}) => {
    const url = new URL(input);
    assert.equal(url.hostname, 'api-preprod.phonepe.com');
    if (url.pathname.endsWith('/oauth/token')) { tokens++; return Response.json({ access_token: 'mock-token', expires_at: Math.floor(Date.now() / 1000) + 3600 }); }
    assert.equal(init.method, 'POST'); posts++;
    return Response.json({ code: 'AUTHORIZATION_FAILED' }, { status: 401 });
  } });
  await assert.rejects(worker.gatewayRefundTransport({ PHONEPE_CLIENT_ID: 'fixture', PHONEPE_CLIENT_SECRET: 'fixture',
    PHONEPE_CLIENT_VERSION: '1', PHONEPE_ENV: 'sandbox' }, 'phonepe', '/payments/v2/refund', { method: 'POST', body: '{}' }),
    error => error.gatewayHttpStatus === 401 && error.gatewayErrorCode === 'AUTHORIZATION_FAILED');
  assert.equal(posts, 1); assert.equal(tokens, 1);
});
