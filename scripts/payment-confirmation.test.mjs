// No live provider calls, orders or money. Real Worker + isolated in-memory D1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';
import { startPaymentConfirmation } from '../react-app/src/lib/paymentConfirmation.js';

function pollFixture(check, options = {}) {
  const document = new EventTarget(), window = new EventTarget();
  document.visibilityState = 'visible'; window.navigator = { onLine: true };
  let time = 0, exhausted = 0, next = 0;
  const timers = new Map();
  const stop = startPaymentConfirmation({ document, window, check, now: () => time,
    schedule: (fn, delay) => { const id = ++next; timers.set(id, {fn, delay}); return id; },
    cancel: id => timers.delete(id), onExhausted: () => exhausted++, ...options });
  return { document, window, timers, stop, get exhausted() { return exhausted; },
    async tick() { await Promise.resolve(); const [id, task] = timers.entries().next().value || []; if (!task) return; timers.delete(id); time += task.delay; await task.fn(); },
    flush: () => new Promise(resolve => setImmediate(resolve)) };
}

test('confirmation checks immediately, sequentially, and stops after verified success', async () => {
  let calls = 0;
  const f = pollFixture(async () => ++calls === 3 ? 'terminal' : 'retry');
  await f.flush(); assert.equal(calls, 1);
  await f.tick(); await f.tick();
  assert.equal(calls, 3); assert.equal(f.timers.size, 0); assert.equal(f.exhausted, 0);
  f.document.dispatchEvent(new Event('visibilitychange')); assert.equal(calls, 3);
});

test('bounded checks pause hidden/offline, resume online, and exhaust safely', async () => {
  let calls = 0; const f = pollFixture(async () => { calls++; return 'retry'; }, { maxAttempts: 3 });
  await f.flush(); f.document.visibilityState = 'hidden'; await f.tick(); assert.equal(calls, 1);
  f.document.visibilityState = 'visible'; f.window.navigator.onLine = false;
  f.document.dispatchEvent(new Event('visibilitychange')); await f.flush(); assert.equal(calls, 1);
  f.window.navigator.onLine = true; f.window.dispatchEvent(new Event('online')); await f.flush();
  assert.equal(calls, 2); await f.tick(); assert.equal(calls, 3); assert.equal(f.exhausted, 1);
  assert.equal(f.timers.size, 0);
});

test('resume cannot overlap an in-flight check; cleanup aborts and never schedules again', async () => {
  let resolve, calls = 0, signal;
  const f = pollFixture(s => { signal = s; calls++; return new Promise(r => { resolve = r; }); });
  f.window.dispatchEvent(new Event('online')); f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 1); f.stop(); assert.equal(signal.aborted, true);
  resolve('retry'); await f.flush(); assert.equal(f.timers.size, 0);
});

test('creation lock skips do not consume the payment-check budget; security errors stop', async () => {
  let calls = 0; const f = pollFixture(async () => ++calls < 3 ? 'skipped' : 'stop', { maxAttempts: 1 });
  await f.flush(); await f.tick(); await f.tick(); assert.equal(calls, 3);
  assert.equal(f.exhausted, 0); assert.equal(f.timers.size, 0);
});

function orderFixture() {
  const f = localDatabase();
  f.db.prepare(`INSERT INTO orders(id,order_number,customer_email,customer_name,items_json,subtotal,total,payable_total,status,payment_method,payment_gateway,payment_status,shipping_json,gateway_order_id,checkout_token)
    VALUES ('confirmation-order','GM-LOCAL-01','buyer@example.com','Buyer','[]',500,500,500,'pending','razorpay','razorpay','pending','{}','gateway-order','local-checkout-token')`).run();
  Object.assign(f.env, { RAZORPAY_KEY_SECRET: 'local-secret', RAZORPAY_KEY_ID: 'local-key', BREVO_API_KEY: 'local-email-key', BREVO_FROM_EMAIL: 'support@example.com', DISABLE_OUTBOUND_PUSH: 'true' });
  f.read = () => f.db.prepare("SELECT * FROM orders WHERE id='confirmation-order'").get();
  return f;
}
function verifyRequest(signature = createHmac('sha256', 'local-secret').update('gateway-order|local-payment').digest('hex')) {
  return new Request('https://local.test/api/payments/razorpay/verify', { method:'POST', body: JSON.stringify({order_id:'confirmation-order',checkout_token:'local-checkout-token',razorpay_order_id:'gateway-order',razorpay_payment_id:'local-payment',razorpay_signature:signature}) });
}

test('verified payment responds before email delivery; durable log and notifications exist first', async t => {
  const {db, env, read} = orderFixture(); t.after(() => db.close());
  let release, sends = 0;
  const jobs = [], ctx = { waitUntil: job => jobs.push(job) };
  const worker = await workerFunctions(['verifyRazorpayPayment'], { fetch: async url => {
    if (String(url).includes('api.razorpay.com')) return Response.json({id:'local-payment',order_id:'gateway-order',currency:'INR',amount:50000,status:'captured'});
    assert.equal(String(url), 'https://api.brevo.com/v3/smtp/email'); sends++;
    return new Promise(resolve => {release = () => resolve(Response.json({messageId:'local-delivery'}));});
  } });
  // A blocked provider must not keep the payment response pending.
  const response = await Promise.race([worker.verifyRazorpayPayment(verifyRequest(),env,null,ctx), new Promise((_, reject) => { const timer=setTimeout(()=>reject(new Error('Payment response waited for email')),1500);timer.unref(); })]);
  assert.equal((await response.json()).payment_status, 'paid'); assert.equal(read().payment_status, 'paid');
  assert.equal(read().confirmation_email_sent_at, null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_notifications').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customer_notifications').get().n, 1);
  assert.equal(db.prepare('SELECT status FROM email_delivery_log').get().status, 'pending');
  await worker.verifyRazorpayPayment(verifyRequest(),env,null,ctx);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(sends, 1);
  release(); await Promise.all(jobs);
  assert.equal(db.prepare('SELECT status FROM email_delivery_log').get().status, 'sent');
  assert.ok(read().confirmation_email_sent_at);
});

test('deferred email rejected before acceptance is logged for retry; cron sets delivered marker', async t => {
  const {db, env, read} = orderFixture(); t.after(() => db.close());
  let sends = 0; const jobs = [];
  const worker = await workerFunctions(['settleGatewayPayment','processDueEmailEvents'], { fetch: async () => ++sends === 1 ? new Response('local rejection',{status:429}) : Response.json({messageId:'local-retry'}) });
  await worker.settleGatewayPayment(env,read(),{status:'paid',amount:50000,ctx:{waitUntil:p=>jobs.push(p)}});
  await Promise.all(jobs);
  assert.equal(read().payment_status,'paid'); assert.equal(read().confirmation_email_sent_at,null);
  const log=db.prepare('SELECT * FROM email_delivery_log').get(); assert.equal(log.status,'failed'); assert.equal(log.delivery_claim,null);
  db.prepare('UPDATE email_delivery_log SET next_attempt_at=NULL').run();
  await worker.processDueEmailEvents(env); assert.equal(sends,2); assert.ok(read().confirmation_email_sent_at);
});

test('bad signature or mismatched payment amount never confirms or queues delivery', async t => {
  const {db,env,read}=orderFixture();t.after(()=>db.close());const jobs=[];
  const worker=await workerFunctions(['verifyRazorpayPayment'],{fetch:async()=>Response.json({id:'local-payment',order_id:'gateway-order',currency:'INR',amount:40000,status:'captured'})});
  assert.equal((await worker.verifyRazorpayPayment(verifyRequest('invalid'),env,null,{waitUntil:p=>jobs.push(p)})).status,400);
  await assert.rejects(worker.verifyRazorpayPayment(verifyRequest(),env,null,{waitUntil:p=>jobs.push(p)}),e=>e.status===422);
  assert.equal(read().payment_status,'pending');assert.equal(jobs.length,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM email_delivery_log').get().n,0);
});

test('PhonePe completed status confirms before blocked email; already paid returns without another gateway check', async t => {
  const {db,env,read}=orderFixture();t.after(()=>db.close());
  db.prepare("UPDATE orders SET payment_method='phonepe',payment_gateway='phonepe' WHERE id='confirmation-order'").run();
  Object.assign(env,{PHONEPE_CLIENT_ID:'local-client',PHONEPE_CLIENT_SECRET:'local-secret',PHONEPE_CLIENT_VERSION:'1'});
  let release, checks=0;const jobs=[];
  const worker=await workerFunctions(['getPhonePePaymentStatus'],{fetch:async url=>{
    if(String(url).includes('/oauth/token'))return Response.json({access_token:'local-token',expires_at:Math.floor(Date.now()/1000)+600});
    if(String(url).includes('/checkout/v2/order/')){checks++;return Response.json({merchantOrderId:'gateway-order',state:'COMPLETED',amount:50000,paymentDetails:[{transactionId:'local-phonepe-payment'}]});}
    assert.equal(String(url),'https://api.brevo.com/v3/smtp/email');return new Promise(resolve=>{release=()=>resolve(Response.json({messageId:'local-delivery'}));});
  }});
  const url=new URL('https://local.test/api/payments/phonepe/status?order_id=confirmation-order&checkout_token=local-checkout-token');
  const response=await worker.getPhonePePaymentStatus(new Request(url),env,null,url,{waitUntil:p=>jobs.push(p)});
  assert.equal((await response.json()).payment_status,'paid');assert.equal(read().confirmation_email_sent_at,null);
  await worker.getPhonePePaymentStatus(new Request(url),env,null,url,{waitUntil:p=>jobs.push(p)});
  assert.equal(checks,1);await new Promise(resolve=>setImmediate(resolve));release();await Promise.all(jobs);assert.ok(read().confirmation_email_sent_at);
});

test('push delivery cannot block confirmation after its in-app notification is committed', async t => {
  const {db,env,read}=orderFixture();t.after(()=>db.close());
  env.DISABLE_OUTBOUND_PUSH='false';
  db.prepare("INSERT INTO customer_push_tokens(token,user_email,active) VALUES ('ExponentPushToken[local-fixture]','buyer@example.com',1)").run();
  let release;const jobs=[];
  const worker=await workerFunctions(['settleGatewayPayment'],{fetch:async url=>{
    if(String(url)==='https://exp.host/--/api/v2/push/send')return new Promise(resolve=>{release=()=>resolve(Response.json({data:[]}));});
    assert.equal(String(url),'https://api.brevo.com/v3/smtp/email');return Response.json({messageId:'local-email'});
  }});
  const result=await worker.settleGatewayPayment(env,read(),{status:'paid',amount:50000,ctx:{waitUntil:p=>jobs.push(p)}});
  assert.equal(result.payment_status,'paid');assert.ok(release);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customer_notifications').get().n,1);
  release();await Promise.all(jobs);
});
