import test from 'node:test';
import assert from 'node:assert/strict';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';
import { approveGatewayRefund, executeGatewayRefund, reconcileGatewayRefund, recoverRazorpayRefund, refundPaise } from '../src/gateway-refunds.js';

function fixture(t, { provider='razorpay',credits=0 } = {}) {
  const { db,env } = localDatabase(); t.after(() => db.close());
  db.prepare("INSERT INTO users(google_sub,email,name,role) VALUES('refund-customer','refund@example.com','Refund customer','seller')").run();
  if (credits) db.prepare("INSERT INTO store_credit_accounts(user_email,balance) VALUES('refund@example.com',?)").run(credits);
  db.prepare(`INSERT INTO orders(id,order_number,customer_email,items_json,subtotal,total,status,payment_method,payment_status,shipping_json,
    credits_used,payable_total,payment_gateway,gateway_order_id,gateway_payment_id)
    VALUES('order','GM-REFUND-TEST','refund@example.com','[]',400,400,'delivered',?,'paid','{}',?,?,?,'provider_order','pay_test')`)
    .run(provider,credits,400-credits,provider);
  db.prepare(`INSERT INTO return_requests(id,order_id,customer_email,type,reason,status,refund_amount,refund_destination)
    VALUES('return','order','refund@example.com','refund','Local test','received',400,'original')`).run();
  const calls=[];
  let status='processed';
  let statusData={};
  const transport=async (gateway,path,init={}) => {
    calls.push({ gateway,path,...init });
    if (init.method === 'POST') return gateway === 'razorpay' ? { id:'rfnd_test',status:'processed' } : { refundId:'phonepe_refund',state:'COMPLETED' };
    if (path.startsWith('/payments/pay_test') || path.startsWith('/checkout/')) return gateway === 'razorpay'
      ? { id:'pay_test',order_id:'provider_order',currency:'INR',amount:(400-credits)*100,amount_refunded:0,status:'captured' }
      : { merchantOrderId:'provider_order',amount:(400-credits)*100,state:'COMPLETED',paymentDetails:[{transactionId:'pay_test',state:'COMPLETED'}] };
    const refund=db.prepare('SELECT * FROM gateway_refunds').get();
    return gateway === 'razorpay'
      ? { id:'rfnd_test',entity:'refund',currency:'INR',payment_id:'pay_test',amount:refund.gateway_paise,status,...statusData }
      : { refundId:'phonepe_refund',originalMerchantOrderId:'provider_order',merchantRefundId:refund.id,amount:refund.gateway_paise,
        state:{ processed:'COMPLETED',pending:'PENDING',failed:'FAILED' }[status],...statusData };
  };
  return { db,env,calls,transport,status: value=>{status=value;}, data: value=>{statusData=value;} };
}
const approve=env=>approveGatewayRefund(env.DB,'return','owner@example.com');
const get=db=>db.prepare('SELECT * FROM gateway_refunds').get();

test('refund amounts are exact paise and reject booleans, unsafe numbers and extra decimals', () => {
  assert.equal(refundPaise('19.99'),1999);
  for (const amount of [null,true,'0','0.99','-1','1.001','Infinity','9007199254740991']) assert.throws(()=>refundPaise(amount));
});

for (const provider of ['razorpay','phonepe']) {
  test(`${provider}: concurrent approval/send uses one financial case and one POST, verified GET settles once`,async t=>{
    const f=fixture(t,{provider});
    const [one,two]=await Promise.all([approve(f.env),approve(f.env)]);
    assert.equal(one.id,two.id);
    await Promise.all([executeGatewayRefund(f.env.DB,one,f.transport,'owner@example.com'),executeGatewayRefund(f.env.DB,two,f.transport,'owner@example.com')]);
    assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
    assert.ok(f.calls.at(-1).path.includes('/refund'));
    assert.equal(get(f.db).state,'processed');
    assert.equal(f.db.prepare('SELECT status FROM return_requests').get().status,'refunded');
    assert.equal(f.db.prepare('SELECT payment_status FROM orders').get().payment_status,'refunded');
    const before=f.calls.length;
    await executeGatewayRefund(f.env.DB,get(f.db),f.transport,'owner@example.com');
    assert.equal(f.calls.length,before);
    assert.throws(()=>f.db.prepare("UPDATE gateway_refund_events SET actor='attacker'").run(),/immutable/);
    assert.throws(()=>f.db.prepare('DELETE FROM gateway_refunds').run(),/retained/);
  });
  test(`${provider}: initiation success cannot settle; a pending status keeps the order paid`,async t=>{
    const f=fixture(t,{provider}); f.status('pending');
    await executeGatewayRefund(f.env.DB,await approve(f.env),f.transport,'owner@example.com');
    assert.equal(get(f.db).state,'pending');
    assert.equal(f.db.prepare('SELECT payment_status FROM orders').get().payment_status,'paid');
    f.status('processed');
    await reconcileGatewayRefund(f.env.DB,get(f.db),f.transport);
    assert.equal(get(f.db).state,'processed');
  });
  test(`${provider}: mismatched amount, payment identity or currency cannot settle`,async t=>{
    const f=fixture(t,{provider}); f.data({amount:1});
    await executeGatewayRefund(f.env.DB,await approve(f.env),f.transport,'owner@example.com');
    assert.equal(get(f.db).state,'reconciliation_required');
    assert.equal(f.db.prepare('SELECT status FROM return_requests').get().status,'received');
    f.data(provider==='razorpay'?{payment_id:'pay_other'}:{originalMerchantOrderId:'other_order'});
    await reconcileGatewayRefund(f.env.DB,get(f.db),f.transport);
    assert.equal(get(f.db).state,'reconciliation_required');
    f.data({currency:'USD'});
    await reconcileGatewayRefund(f.env.DB,get(f.db),f.transport);
    assert.equal(get(f.db).state,'reconciliation_required');
  });
}

test('mixed payment restores only original credits once, after provider confirmation',async t=>{
  const f=fixture(t,{credits:100});
  const approved=await approve(f.env);
  assert.equal(approved.gateway_paise,30000);
  f.status('pending');
  await executeGatewayRefund(f.env.DB,approved,f.transport,'owner@example.com');
  assert.equal(f.db.prepare('SELECT balance FROM store_credit_accounts').get().balance,0);
  f.status('processed');
  await Promise.all([reconcileGatewayRefund(f.env.DB,get(f.db),f.transport),reconcileGatewayRefund(f.env.DB,get(f.db),f.transport)]);
  assert.equal(f.db.prepare('SELECT balance FROM store_credit_accounts').get().balance,100);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM store_credit_ledger WHERE kind='refund'").get().n,1);
});

test('partial mixed payment uses the authorised proportional split exactly once',async t=>{
  const f=fixture(t,{credits:100});
  const approved=await approveGatewayRefund(f.env.DB,'return','owner@example.com','199.99');
  assert.equal(approved.credit_amount,50);
  assert.equal(approved.gateway_paise,14999);
  assert.equal(approved.total_paise,approved.gateway_paise+approved.credit_amount*100);
  assert.equal(approved.original_gateway_paise,30000);
  await executeGatewayRefund(f.env.DB,approved,f.transport,'owner@example.com');
  assert.equal(get(f.db).state,'processed');
  assert.equal(f.db.prepare('SELECT balance FROM store_credit_accounts').get().balance,50);
  assert.equal(f.db.prepare('SELECT payment_status FROM orders').get().payment_status,'paid');
  await reconcileGatewayRefund(f.env.DB,get(f.db),f.transport);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM store_credit_ledger WHERE kind='refund'").get().n,1);
});

test('partial gateway refund leaves order payment paid and freezes the approved amount',async t=>{
  const f=fixture(t);
  const approved=await approveGatewayRefund(f.env.DB,'return','owner@example.com','199.99');
  await assert.rejects(approveGatewayRefund(f.env.DB,'return','owner@example.com','200'),/cannot be changed/);
  assert.throws(()=>f.db.prepare("UPDATE return_requests SET refund_amount=250").run(),/locks/);
  await executeGatewayRefund(f.env.DB,approved,f.transport,'owner@example.com');
  assert.equal(get(f.db).state,'processed');
  assert.equal(f.db.prepare('SELECT payment_status FROM orders').get().payment_status,'paid');
  assert.equal(f.calls.find(call=>call.method==='POST').body,JSON.stringify({amount:19999}));
  const worker=await workerFunctions(['updateReturnRequest']);
  const completed=await worker.updateReturnRequest(new Request('https://glamiastore.com/api/admin/returns/return',{
    method:'PATCH',body:JSON.stringify({status:'completed',refund_amount:199.99})
  }),f.env,{email:'owner@example.com',role:'admin',is_owner:true},'return');
  assert.equal(completed.status,200);
  assert.equal(f.db.prepare('SELECT refund_amount FROM return_requests').get().refund_amount,199.99);
});

test('refund cannot be approved for unpaid, nonreceived, exchange or store-credit requests',async t=>{
  const f=fixture(t);
  for (const [sql,restore] of [
    ["UPDATE orders SET payment_status='pending'","UPDATE orders SET payment_status='paid'"],
    ["UPDATE return_requests SET status='approved'","UPDATE return_requests SET status='received'"],
    ["UPDATE return_requests SET type='exchange'","UPDATE return_requests SET type='refund'"],
    ["UPDATE return_requests SET refund_destination='store_credit'","UPDATE return_requests SET refund_destination='original'"]
  ]) { f.db.exec(sql); await assert.rejects(approve(f.env)); f.db.exec(restore); }
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM gateway_refunds').get().n,0);
});

test('provider POST timeout never creates a second refund; Razorpay recovery reuses exact key and body',async t=>{
  const f=fixture(t);
  const approved=await approve(f.env);
  const failing=async (provider,path,init) => { if(init?.method==='POST') { f.calls.push({provider,path,...init}); throw new Error('Network timeout after provider accepted'); } return f.transport(provider,path,init); };
  await executeGatewayRefund(f.env.DB,approved,failing,'owner@example.com');
  assert.equal(get(f.db).state,'reconciliation_required');
  await executeGatewayRefund(f.env.DB,get(f.db),f.transport,'owner@example.com');
  assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  await recoverRazorpayRefund(f.env.DB,get(f.db),f.transport,'owner@example.com');
  const posts=f.calls.filter(call=>call.method==='POST');
  assert.equal(posts[0].headers['X-Refund-Idempotency'],posts[1].headers['X-Refund-Idempotency']);
  assert.equal(posts[0].body,posts[1].body);
  assert.equal(get(f.db).state,'processed');
});

test('PhonePe timeout recovers via merchant refund status GET, never resubmits a POST',async t=>{
  const f=fixture(t,{provider:'phonepe'});
  const failing=async (provider,path,init) => { if(init?.method==='POST') { f.calls.push({provider,path,...init}); throw new Error('Timeout'); } return f.transport(provider,path,init); };
  await executeGatewayRefund(f.env.DB,await approve(f.env),failing,'owner@example.com');
  await executeGatewayRefund(f.env.DB,get(f.db),f.transport,'owner@example.com');
  assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  assert.equal(get(f.db).state,'processed');
});

test('original payment mismatch stops before refund POST and cannot use recovery',async t=>{
  const f=fixture(t);
  await executeGatewayRefund(f.env.DB,await approve(f.env),async()=>({amount:1}), 'owner@example.com');
  assert.equal(get(f.db).create_attempted,0);
  await assert.rejects(recoverRazorpayRefund(f.env.DB,get(f.db),f.transport,'owner@example.com'));
  assert.equal(f.calls.length,0);
});

test('changed payment snapshot after approval cannot send money',async t=>{
  const f=fixture(t,{credits:100});
  const approved=await approve(f.env);
  f.db.prepare("UPDATE orders SET payable_total=400,credits_used=0 WHERE id='order'").run();
  await assert.rejects(executeGatewayRefund(f.env.DB,approved,f.transport,'owner@example.com'),/changed after approval/);
  assert.equal(f.calls.length,0);
  assert.equal(get(f.db).state,'approved');
});

test('an external gateway refund stops before any additional refund POST',async t=>{
  const f=fixture(t);
  const approved=await approveGatewayRefund(f.env.DB,'return','owner@example.com','100');
  const transport=async(provider,path,init)=>path==='/payments/pay_test'
    ? {id:'pay_test',order_id:'provider_order',currency:'INR',amount:40000,amount_refunded:10000,status:'captured'}
    : f.transport(provider,path,init);
  await executeGatewayRefund(f.env.DB,approved,transport,'owner@example.com');
  assert.equal(f.calls.length,0);
  assert.equal(get(f.db).state,'reconciliation_required');
});

test('stale pending response cannot downgrade processed or restore credits twice',async t=>{
  const f=fixture(t,{credits:100}); f.status('pending');
  await executeGatewayRefund(f.env.DB,await approve(f.env),f.transport,'owner@example.com');
  const pending=get(f.db);
  f.status('processed'); await reconcileGatewayRefund(f.env.DB,pending,f.transport);
  f.status('pending'); await reconcileGatewayRefund(f.env.DB,pending,f.transport);
  assert.equal(get(f.db).state,'processed');
  assert.equal(f.db.prepare('SELECT balance FROM store_credit_accounts').get().balance,100);
});

test('Worker financial actions require an actual whitelisted owner and live execution is opt-in',async t=>{
  const f=fixture(t); f.env.ADMIN_EMAILS=['owner@example.com'];
  const worker=await workerFunctions(['handleGatewayRefund']);
  const request=action=>new Request(`https://glamiastore.com/api/admin/returns/return/refund/${action}`,{method:'POST',body:'{}'});
  for(const actor of [{email:'owner@example.com',role:'admin'},{email:'other@example.com',is_owner:true},{email:'manager@example.com',role:'admin',employee_permissions:{returns:true},is_owner:false}]) {
    await assert.rejects(worker.handleGatewayRefund(request('approve'),f.env,actor,'return','approve'),error=>error.status===403);
  }
  const owner={email:'owner@example.com',role:'admin',is_owner:true};
  assert.equal((await worker.handleGatewayRefund(request('approve'),f.env,owner,'return','approve')).status,200);
  await assert.rejects(worker.handleGatewayRefund(request('execute'),f.env,owner,'return','execute'),error=>error.status===503);
  assert.equal(get(f.db).state,'approved');
});
