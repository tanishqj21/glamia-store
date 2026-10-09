import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';
import { approveGatewayRefund, executeGatewayRefund } from '../src/gateway-refunds.js';

// Documented PhonePe Standard Checkout callbacks and production URLs, with
// real SQLite migrations. All provider traffic is mocked; no live payout.
async function fixture(t, { kind = 'return', credits = 0, inFlight = false } = {}) {
  const { db, env } = localDatabase(); t.after(() => db.close());
  Object.assign(env, { PHONEPE_CLIENT_ID: 'fixture', PHONEPE_CLIENT_SECRET: 'fixture', PHONEPE_CLIENT_VERSION: '1',
    PHONEPE_ENV: 'production', PHONEPE_WEBHOOK_USERNAME: 'fixture-user', PHONEPE_WEBHOOK_PASSWORD: 'fixture-pass',
    ADMIN_EMAILS: ['owner@example.com'], DISABLE_OUTBOUND_PUSH: 'true' });
  db.prepare("INSERT INTO users(google_sub,email,name,role) VALUES('pp-hook','hook@example.com','Local buyer','seller')").run();
  if (credits) db.prepare("INSERT INTO store_credit_accounts(user_email,balance) VALUES('hook@example.com',?)").run(credits);
  db.prepare(`INSERT INTO orders(id,order_number,customer_email,items_json,subtotal,total,status,payment_method,payment_status,
    credits_used,payable_total,payment_gateway,gateway_order_id,gateway_payment_id,shipping_json)
    VALUES('hook-order','GM-HOOK-LOCAL','hook@example.com','[]',400,400,?,'phonepe','paid',?,?,'phonepe','PP-hook','OM-hook','{}')`)
    .run(kind === 'return' ? 'delivered' : 'confirmed', credits, 400 - credits);
  const table = kind === 'return' ? 'gateway_refunds' : 'cancellation_refunds';
  let approved;
  if (kind === 'return') {
    db.prepare(`INSERT INTO return_requests(id,order_id,customer_email,type,reason,status,refund_amount,refund_destination)
      VALUES('hook-return','hook-order','hook@example.com','refund','Local test','received',400,'original')`).run();
    approved = await approveGatewayRefund(env.DB, 'hook-return', 'owner@example.com');
  } else {
    db.prepare("UPDATE orders SET status='cancelled' WHERE id='hook-order'").run();
    approved = db.prepare(`SELECT * FROM ${table}`).get();
  }
  const amount = (400 - credits) * 100;
  if (inFlight) db.prepare(`UPDATE ${table} SET state='submitting',attempts=1,create_attempted=1,
    next_check_at=datetime('now','+15 minutes') WHERE id=?`).run(approved.id);
  else await executeGatewayRefund(env.DB, approved, async (_provider, path, init = {}) => {
    if (path.startsWith('/checkout/')) return { state: 'COMPLETED', amount, paymentDetails: [{ transactionId: 'OM-hook', state: 'COMPLETED' }] };
    if (init.method === 'POST') return { refundId: 'OMR-hook', amount, state: 'PENDING' };
    return { refundId: 'OMR-hook', originalMerchantOrderId: 'PP-hook', amount, state: 'PENDING' };
  }, 'owner@example.com');
  const read = () => db.prepare(`SELECT * FROM ${table}`).get();
  const calls = [];
  let state = 'COMPLETED', override = {}, error = false, gate;
  const worker = await workerFunctions(['handlePhonePeWebhook'], { fetch: async (input, init = {}) => {
    const url = new URL(input); calls.push({ url, method: init.method || 'GET', authorization: init.headers.Authorization });
    assert.equal(url.hostname, 'api.phonepe.com');
    if (url.pathname === '/apis/identity-manager/v1/oauth/token') {
      assert.equal(init.method, 'POST');
      const form = new URLSearchParams(init.body);
      assert.equal(form.get('grant_type'), 'client_credentials'); assert.equal(form.get('client_version'), '1');
      return Response.json({ access_token: 'fixture-token', expires_at: Math.floor(Date.now() / 1000) + 3600 });
    }
    assert.equal(init.method || 'GET', 'GET', 'A refund callback must never create another payout');
    assert.equal(init.headers.Authorization, 'O-Bearer fixture-token');
    assert.equal(url.pathname, `/apis/pg/payments/v2/refund/${read().id}/status`);
    if (gate) await gate;
    if (error) return Response.json({ code: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
    return Response.json({ originalMerchantOrderId: 'PP-hook', amount, state, refundId: 'OMR-hook', ...override });
  } });
  const body = (extra = {}) => ({ merchantRefundId: read().id, originalMerchantOrderId: 'PP-hook', amount, state: 'COMPLETED', refundId: 'OMR-hook', ...extra });
  const hook = (payload = { event: 'pg.refund.completed', payload: body() }, auth = 'standard', ctx) => {
    const raw = JSON.stringify(payload);
    const headers = auth === 'hmac'
      ? { 'x-phonepe-checksum-key-id': env.PHONEPE_WEBHOOK_ID, 'x-phonepe-checksum-signature': createHmac('sha256', env.PHONEPE_WEBHOOK_SECRET).update(raw).digest('hex') }
      : { Authorization: auth === 'standard' ? createHash('sha256').update(`${env.PHONEPE_WEBHOOK_USERNAME}:${env.PHONEPE_WEBHOOK_PASSWORD}`).digest('hex') : 'forged' };
    return worker.handlePhonePeWebhook(new Request('https://glamiastore.com/api/payments/webhooks/phonepe', { method: 'POST', headers, body: raw }), env, ctx);
  };
  return { db, env, calls, read, body, hook, state: value => { state = value; }, data: value => { override = value; },
    fail: () => { error = true; }, gate: value => { gate = value; } };
}

for (const kind of ['return', 'cancellation']) {
  test(`PhonePe ${kind}: documented refund callback verifies via GET and settles once`, async t => {
    const f = await fixture(t, { kind, credits: 100 });
    assert.equal((await f.hook()).status, 200);
    assert.equal(f.read().state, 'processed'); assert.equal(f.read().last_actor, 'system:phonepe-refund-webhook');
    assert.equal(f.db.prepare('SELECT payment_status FROM orders').get().payment_status, 'refunded');
    assert.equal(f.db.prepare('SELECT balance FROM store_credit_accounts').get().balance, 100);
    const before = f.calls.length;
    await f.hook(); assert.equal(f.calls.length, before);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM store_credit_ledger WHERE amount>0").get().n, 1);
  });
}

test('bare UPI and netbanking refund callbacks map by provider refund ID', async t => {
  const f = await fixture(t);
  const payload = f.body(); delete payload.merchantRefundId;
  await f.hook(payload);
  assert.equal(f.read().state, 'processed');
  assert.equal(f.calls.filter(call => call.method === 'GET').length, 1);
});

test('callback completion cannot override an authenticated pending response', async t => {
  const f = await fixture(t); f.state('PENDING');
  await f.hook(); assert.equal(f.read().state, 'pending');
  assert.equal(f.db.prepare('SELECT payment_status FROM orders').get().payment_status, 'paid');
  assert.equal(f.db.prepare('SELECT status FROM return_requests').get().status, 'received');
});

test('failed refund callback is verified and retained for review without another payout', async t => {
  const f = await fixture(t); f.state('FAILED');
  // PhonePe documents failed callbacks with an empty original order reference.
  const payload = f.body({ originalMerchantOrderId: '', state: 'FAILED' }); delete payload.merchantRefundId;
  await f.hook({ event: 'pg.refund.failed', payload });
  assert.equal(f.read().state, 'failed');
  assert.equal(f.db.prepare('SELECT payment_status FROM orders').get().payment_status, 'paid');
});

test('invalid webhook authentication stops before database or provider work', async t => {
  const f = await fixture(t);
  assert.equal((await f.hook(undefined, 'forged')).status, 401);
  assert.equal(f.calls.length, 0); assert.equal(f.read().state, 'pending');
});

test('unknown or conflicting refund references and amounts never touch another case', async t => {
  const f = await fixture(t);
  for (const extra of [{ merchantRefundId: 'unknown' }, { refundId: 'OMR-other' }, { originalMerchantOrderId: 'PP-other' },
    { amount: 1 }, { amount: '40000' }, { merchantRefundId: 'x'.repeat(64) }, { refundId: 'x'.repeat(161) }]) {
    assert.equal((await f.hook({ event: 'pg.refund.completed', payload: f.body(extra) })).status, 200);
  }
  assert.equal(f.calls.length, 0); assert.equal(f.read().state, 'pending');
});

test('provider mismatches and outages remain unconfirmed despite a completed callback', async t => {
  const f = await fixture(t); f.data({ amount: 39999 }); await f.hook();
  assert.equal(f.read().state, 'reconciliation_required');
  f.data({ refundId: 'OMR-other' }); await f.hook(); assert.equal(f.read().state, 'reconciliation_required');
  f.fail(); await f.hook(); assert.match(f.read().last_error, /HTTP 500/);
  assert.equal(f.db.prepare('SELECT payment_status FROM orders').get().payment_status, 'paid');
});

test('in-flight refund creation is left for reconciliation without racing its response', async t => {
  const f = await fixture(t, { inFlight: true });
  await f.hook(); assert.equal(f.calls.length, 0); assert.equal(f.read().state, 'submitting');
});

test('slow provider status does not delay webhook acknowledgement; background GET still settles', async t => {
  const f = await fixture(t);
  let release; f.gate(new Promise(resolve => { release = resolve; }));
  const tasks = [];
  const response = await f.hook(undefined, 'standard', { waitUntil: task => tasks.push(task) });
  assert.equal(response.status, 200); assert.equal(tasks.length, 1);
  assert.equal(f.read().state, 'pending');
  release(); await Promise.all(tasks); assert.equal(f.read().state, 'processed');
});

test('existing checksum authentication still works and takes precedence over SHA credentials', async t => {
  const f = await fixture(t);
  Object.assign(f.env, { PHONEPE_WEBHOOK_SECRET: 'fixture-hmac', PHONEPE_WEBHOOK_ID: 'fixture-id' });
  assert.equal((await f.hook()).status, 401); assert.equal(f.calls.length, 0);
  f.state('PENDING'); await f.hook(undefined, 'hmac'); assert.equal(f.calls.filter(call => call.method === 'GET').length, 1);
  f.state('COMPLETED'); await f.hook(undefined, 'hmac'); assert.equal(f.read().state, 'processed');
});
