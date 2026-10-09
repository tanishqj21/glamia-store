import test from 'node:test';
import assert from 'node:assert/strict';
import {localDatabase,workerFunctions} from './lib/worker-fixture.mjs';
import {executeGatewayRefund,reconcileGatewayRefund,recoverRazorpayRefund} from '../src/gateway-refunds.js';
import {attachCancellationRefunds} from '../src/cancellation-refunds.js';

function fixture(t,{provider='razorpay',credits=0,status='confirmed',paid=true}={}) {
  const {db,env}=localDatabase();t.after(()=>db.close());
  db.prepare("INSERT INTO users(google_sub,email,name,role) VALUES('cancel-buyer','buyer@example.com','Buyer','seller')").run();
  if(credits)db.prepare("INSERT INTO store_credit_accounts(user_email,balance) VALUES('buyer@example.com',?)").run(credits);
  db.prepare(`INSERT INTO orders(id,order_number,customer_email,items_json,subtotal,total,status,payment_method,payment_status,
    credits_used,payable_total,payment_gateway,gateway_order_id,gateway_payment_id,shipping_json)
    VALUES('cancel-order','GM-CANCEL-LOCAL','buyer@example.com','[]',400,400,?,?,?, ?,?,?, 'provider_order','pay_test','{}')`)
    .run(status,provider,paid?'paid':'pending',credits,400-credits,provider==='store_credit'?null:provider);
  Object.assign(env,{ADMIN_EMAILS:['owner@example.com'],DISABLE_OUTBOUND_PUSH:'true'});
  let state='pending',override={},timeout=false,verification={},posts=0;
  const calls=[];
  const transport=async(provider,path,init={})=>{
    calls.push({provider,path,...init});
    if(init.method==='POST'){posts++;if(timeout)throw Error('Uncertain provider POST');return provider==='razorpay'?{id:'rfnd_cancel'}:{refundId:'phonepe_cancel'};}
    if(path.startsWith('/payments/pay_test')||path.startsWith('/checkout/'))return provider==='razorpay'
      ?{id:'pay_test',order_id:'provider_order',currency:'INR',amount:(400-credits)*100,amount_refunded:0,status:'captured',...verification}
      :{merchantOrderId:'provider_order',amount:(400-credits)*100,state:'COMPLETED',paymentDetails:[{transactionId:'pay_test',state:'COMPLETED'}],...verification};
    const refund=db.prepare('SELECT * FROM cancellation_refunds').get();
    return provider==='razorpay'?{entity:'refund',id:'rfnd_cancel',payment_id:'pay_test',currency:'INR',amount:refund.gateway_paise,status:state,...override}
      :{refundId:'phonepe_cancel',merchantRefundId:refund.id,originalMerchantOrderId:'provider_order',amount:refund.gateway_paise,state:{pending:'PENDING',processed:'COMPLETED',failed:'FAILED'}[state],...override};
  };
  return {db,env,calls,transport,posts:()=>posts,get:()=>db.prepare('SELECT * FROM cancellation_refunds').get(),
    cancel:()=>db.prepare("UPDATE orders SET status='cancelled' WHERE id='cancel-order'").run(),
    state:value=>{state=value;},data:value=>{override=value;},timeout:value=>{timeout=value;},verification:value=>{verification=value;}};
}

for(const provider of ['razorpay','phonepe']) {
  test(`${provider}: paid cancellation records intent atomically; concurrent execution sends one refund; only verified completion settles`,async t=>{
    const f=fixture(t,{provider});f.cancel();const refund=f.get();assert.equal(refund.state,'approved');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM return_requests').get().n,0);
    await Promise.all([executeGatewayRefund(f.env.DB,refund,f.transport,'system:order-cancellation'),executeGatewayRefund(f.env.DB,refund,f.transport,'system:order-cancellation')]);
    assert.equal(f.posts(),1);assert.equal(f.get().state,'pending');assert.equal(f.db.prepare('SELECT payment_status FROM orders').get().payment_status,'paid');
    f.state('processed');await reconcileGatewayRefund(f.env.DB,f.get(),f.transport);
    assert.deepEqual({...f.db.prepare('SELECT status,payment_status FROM orders').get()},{status:'cancelled',payment_status:'refunded'});
    const before=f.calls.length;f.cancel();await executeGatewayRefund(f.env.DB,f.get(),f.transport,'system');assert.equal(f.calls.length,before);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cancellation_refunds').get().n,1);
    assert.throws(()=>f.db.prepare("UPDATE cancellation_refunds SET gateway_paise=1").run(),/immutable/);
    assert.throws(()=>f.db.prepare("UPDATE cancellation_refund_events SET actor='other'").run(),/immutable/);
    assert.throws(()=>f.db.prepare('DELETE FROM cancellation_refunds').run(),/retained/);
  });
  test(`${provider}: mixed credits restore once on cancellation, never again when the bank refund confirms`,async t=>{
    const f=fixture(t,{provider,credits:100});assert.equal(f.db.prepare('SELECT balance FROM store_credit_accounts').get().balance,0);
    f.cancel();assert.equal(f.db.prepare('SELECT balance FROM store_credit_accounts').get().balance,100);
    assert.equal(f.get().gateway_paise,30000);f.state('processed');await executeGatewayRefund(f.env.DB,f.get(),f.transport,'system');
    await reconcileGatewayRefund(f.env.DB,f.get(),f.transport);f.cancel();
    assert.equal(f.db.prepare('SELECT balance FROM store_credit_accounts').get().balance,100);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM store_credit_ledger WHERE amount>0").get().n,1);
  });
  test(`${provider}: amount/identity mismatch and provider failure never become refunded`,async t=>{
    const f=fixture(t,{provider});f.cancel();f.data({amount:1});await executeGatewayRefund(f.env.DB,f.get(),f.transport,'system');
    assert.equal(f.get().state,'reconciliation_required');assert.equal(f.db.prepare('SELECT payment_status FROM orders').get().payment_status,'paid');
    f.data(provider==='razorpay'?{payment_id:'pay_other'}:{originalMerchantOrderId:'wrong'});f.state('processed');await reconcileGatewayRefund(f.env.DB,f.get(),f.transport);
    assert.equal(f.get().state,'reconciliation_required');f.data({});f.state('failed');await reconcileGatewayRefund(f.env.DB,f.get(),f.transport);assert.equal(f.get().state,'failed');
    assert.equal(f.db.prepare('SELECT payment_status FROM orders').get().payment_status,'paid');
  });
  test(`${provider}: external refunds/original-payment mismatch stop before any POST`,async t=>{
    const f=fixture(t,{provider});f.cancel();f.verification(provider==='razorpay'?{amount_refunded:40000}:{amount:1});
    await executeGatewayRefund(f.env.DB,f.get(),f.transport,'system');assert.equal(f.posts(),0);assert.equal(f.get().state,'reconciliation_required');
    await executeGatewayRefund(f.env.DB,f.get(),f.transport,'system');assert.equal(f.posts(),0);
  });
}

test('pure store-credit cancellation is confirmed and restores credits exactly once without gateway calls',async t=>{
  const f=fixture(t,{provider:'store_credit',credits:400});f.cancel();
  assert.equal(f.get().state,'processed');assert.equal(f.db.prepare('SELECT payment_status FROM orders').get().payment_status,'refunded');
  await executeGatewayRefund(f.env.DB,f.get(),f.transport,'system');f.cancel();assert.equal(f.posts(),0);
  assert.equal(f.db.prepare('SELECT balance FROM store_credit_accounts').get().balance,400);
});
test('unpaid cancellations never create an automatic financial case',t=>{
  const f=fixture(t,{paid:false});f.cancel();assert.equal(f.get(),undefined);
});
test('missing payment references and dispatched cancellations create a review case, never a payout',async t=>{
  const f=fixture(t,{status:'shipped'});f.db.prepare("UPDATE orders SET gateway_payment_id=NULL WHERE id='cancel-order'").run();f.cancel();
  assert.equal(f.get().state,'reconciliation_required');await executeGatewayRefund(f.env.DB,f.get(),f.transport,'system');assert.equal(f.posts(),0);
});
test('changed payment snapshot blocks execution',async t=>{
  const f=fixture(t);f.cancel();f.db.prepare("UPDATE orders SET gateway_payment_id='other' WHERE id='cancel-order'").run();
  await assert.rejects(executeGatewayRefund(f.env.DB,f.get(),f.transport,'system'),/changed/);assert.equal(f.posts(),0);
});
test('two cancelled orders cannot refund the same provider payment',async t=>{
  const f=fixture(t);f.cancel();
  f.db.prepare(`INSERT INTO orders(id,order_number,customer_email,items_json,subtotal,total,status,payment_method,payment_status,
    payable_total,payment_gateway,gateway_order_id,gateway_payment_id,shipping_json)
    VALUES('duplicate','GM-DUPLICATE','buyer@example.com','[]',400,400,'confirmed','razorpay','paid',400,'razorpay','duplicate_provider_order','pay_test','{}')`).run();
  f.db.prepare("UPDATE orders SET status='cancelled' WHERE id='duplicate'").run();
  assert.equal(f.db.prepare("SELECT state FROM cancellation_refunds WHERE order_id='duplicate'").get().state,'reconciliation_required');
  await assert.rejects(executeGatewayRefund(f.env.DB,f.get(),f.transport,'system'),/changed/);assert.equal(f.posts(),0);
});
test('reconciliation does not interfere with an in-flight cancellation refund submission',async t=>{
  const f=fixture(t);f.cancel();
  let resume;const gate=new Promise(resolve=>{resume=resolve;});let entered;
  const ready=new Promise(resolve=>{entered=resolve;});
  const transport=async(...args)=>{if(args[1].startsWith('/payments/pay_test')&&!args[2]?.method){entered();await gate;}return f.transport(...args);};
  const running=executeGatewayRefund(f.env.DB,f.get(),transport,'system');await ready;
  const current=f.get();assert.equal(current.state,'submitting');
  await reconcileGatewayRefund(f.env.DB,current,f.transport);assert.equal(f.get().state,'submitting');assert.equal(f.calls.length,0);
  resume();await running;assert.equal(f.get().state,'pending');assert.equal(f.posts(),1);
});
test('return and cancellation workflows cannot own the same refund payment',async t=>{
  const f=fixture(t);f.cancel();
  f.db.prepare(`INSERT INTO return_requests(id,order_id,customer_email,type,reason,status,refund_amount,refund_destination)
    VALUES('after-sale','cancel-order','buyer@example.com','refund','Local test','received',400,'original')`).run();
  assert.throws(()=>f.db.prepare(`INSERT INTO gateway_refunds(id,return_request_id,order_id,provider,provider_order_id,provider_payment_id,
    total_paise,gateway_paise,order_total_paise,approved_by,last_actor) VALUES('other','after-sale','cancel-order','razorpay','provider_order','pay_test',40000,40000,40000,'owner','owner')`).run(),/cancellation refund/);
});
test('cancelling a real zero-value replacement does not create any refund',async t=>{
  const f=fixture(t);const w=await workerFunctions(['createReturnRequest','cancelOwnOrder']);
  f.db.prepare("UPDATE orders SET status='delivered',delivered_at=CURRENT_TIMESTAMP WHERE id='cancel-order'").run();
  f.db.prepare("UPDATE products SET status='live',stock=10 WHERE id='seed-ivory-linen-shirt'").run();
  f.db.prepare("INSERT OR REPLACE INTO product_sizes(product_id,size,stock) VALUES('seed-ivory-linen-shirt','L',5)").run();
  f.db.prepare("INSERT INTO order_items(id,order_id,product_id,product_name,unit_price,quantity,size,returnable_snapshot) VALUES('line','cancel-order','seed-ivory-linen-shirt','Shirt',400,1,'M',1)").run();
  const request=new Request('http://127.0.0.1/api/orders/cancel-order/returns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'exchange',reason:'Change purchased size',exchange_line_id:'line',exchange_product_id:'seed-ivory-linen-shirt',exchange_from_size:'M',exchange_to_size:'L',items:[{line_id:'line',quantity:1}],refund_destination:'original'})});
  const response=await w.createReturnRequest(request,f.env,{email:'buyer@example.com'},'cancel-order');const result=await response.json();assert.equal(response.status,201,JSON.stringify(result));
  const replacement=f.db.prepare("SELECT id FROM orders WHERE order_type='replacement'").get();assert.ok(replacement);
  const cancelled=await w.cancelOwnOrder(new Request('http://127.0.0.1/cancel',{method:'POST'}),f.env,{email:'buyer@example.com'},replacement.id);assert.equal(cancelled.status,200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cancellation_refunds').get().n,0);
});
test('Razorpay POST timeout recovery uses the same financial key and body, no automatic retry',async t=>{
  const f=fixture(t);f.cancel();f.timeout(true);await executeGatewayRefund(f.env.DB,f.get(),f.transport,'system');
  assert.equal(f.posts(),1);assert.equal(f.get().state,'reconciliation_required');
  await executeGatewayRefund(f.env.DB,f.get(),f.transport,'system');assert.equal(f.posts(),1);
  f.timeout(false);f.state('processed');await recoverRazorpayRefund(f.env.DB,f.get(),f.transport,'owner');
  const posts=f.calls.filter(call=>call.method==='POST');assert.equal(posts[0].headers['X-Refund-Idempotency'],posts[1].headers['X-Refund-Idempotency']);assert.equal(posts[0].body,posts[1].body);
  assert.equal(f.get().state,'processed');
});
test('PhonePe POST timeout reconciles by merchant ID using GET only',async t=>{
  const f=fixture(t,{provider:'phonepe'});f.cancel();f.timeout(true);await executeGatewayRefund(f.env.DB,f.get(),f.transport,'system');assert.equal(f.posts(),1);
  f.timeout(false);f.state('processed');await executeGatewayRefund(f.env.DB,f.get(),f.transport,'system');assert.equal(f.posts(),1);assert.equal(f.get().state,'processed');
});
test('customer projection exposes amounts/status but no internal diagnostics, evidence or staff identity',async t=>{
  const f=fixture(t);f.cancel();f.db.prepare("UPDATE cancellation_refunds SET last_error='secret-provider-error' WHERE order_id='cancel-order'").run();
  const order=f.db.prepare('SELECT * FROM orders').get();const [view]=await attachCancellationRefunds(f.env,[order]);
  assert.doesNotMatch(JSON.stringify(view.cancellation_refund),/secret-provider-error|approved_by|last_actor|evidence_json/);
});
test('legacy paid cancelled orders are visible as needs review, not silently queued or paid',async t=>{
  const f=fixture(t,{status:'cancelled'});assert.equal(f.get(),undefined);
  const [view]=await attachCancellationRefunds(f.env,[f.db.prepare('SELECT * FROM orders').get()]);assert.equal(view.cancellation_refund.state,'review_required');assert.equal(f.posts(),0);
});
test('actual customer/admin handlers enforce ownership, dispatch and refund authority; disabled execution queues safely',async t=>{
  const f=fixture(t);const w=await workerFunctions(['cancelOwnOrder','handleCancellationRefund','updateOrderStatus'],{fetch:()=>{throw Error('External network forbidden');}});
  const request=new Request('http://127.0.0.1/api/orders/cancel-order/cancel',{method:'POST',body:'{}'});
  assert.equal((await w.cancelOwnOrder(request,f.env,{email:'other@example.com'},'cancel-order')).status,404);
  f.db.prepare("UPDATE orders SET tracking_number='TRACK' WHERE id='cancel-order'").run();assert.equal((await w.cancelOwnOrder(request,f.env,{email:'buyer@example.com'},'cancel-order')).status,409);
  f.db.prepare("UPDATE orders SET tracking_number=NULL WHERE id='cancel-order'").run();
  const response=await w.cancelOwnOrder(request,f.env,{email:'buyer@example.com'},'cancel-order');assert.equal(response.status,200);assert.equal((await response.json()).order.cancellation_refund.state,'approved');
  const post=new Request('http://127.0.0.1/api/admin/orders/cancel-order/cancellation-refund/process',{method:'POST',body:'{}'});
  await assert.rejects(w.handleCancellationRefund(post,f.env,{email:'staff@example.com',role:'admin'},'cancel-order','process'),/whitelisted/);
  await assert.rejects(w.handleCancellationRefund(post,f.env,{email:'owner@example.com',role:'admin',is_owner:true},'cancel-order','process'),/disabled/);
  assert.equal(f.posts(),0);
});

async function automaticWorker(f) {
  Object.assign(f.env,{GATEWAY_REFUNDS_ENABLED:'true',RAZORPAY_KEY_ID:'local-test',RAZORPAY_KEY_SECRET:'local-test',
    PHONEPE_CLIENT_ID:'local-test',PHONEPE_CLIENT_SECRET:'local-test',PHONEPE_CLIENT_VERSION:'1',PHONEPE_ENV:'sandbox'});
  return workerFunctions(['processGatewayRefunds','processCancellationRefund','handleCancellationRefund','cancelOwnOrder'],{
    fetch:async(input,init={})=>{
      const url=new URL(input);
      assert.ok(['api.razorpay.com','api-preprod.phonepe.com'].includes(url.hostname),'Unexpected external service');
      if(url.pathname.endsWith('/oauth/token'))return Response.json({access_token:'local-fixture-token',expires_at:Math.floor(Date.now()/1000)+3600});
      const provider=url.hostname==='api.razorpay.com'?'razorpay':'phonepe';
      const path=provider==='razorpay'?url.pathname.replace(/^\/v1/,''):url.pathname.slice(url.pathname.indexOf('/checkout/')>=0
        ?url.pathname.indexOf('/checkout/'):url.pathname.indexOf('/payments/'));
      return Response.json(await f.transport(provider,path,init));
    }
  });
}

for(const provider of ['razorpay','phonepe']) {
  test(`${provider}: actual background cancellation and cron complete one refund with durable customer updates`,async t=>{
    const f=fixture(t,{provider,credits:100});const w=await automaticWorker(f);const background=[];
    const response=await w.cancelOwnOrder(new Request('http://127.0.0.1/cancel',{method:'POST'}),f.env,{email:'buyer@example.com'},'cancel-order',
      {waitUntil:promise=>background.push(promise)});
    assert.equal(response.status,200);await Promise.all(background);assert.equal(f.get().state,'pending');assert.equal(f.posts(),1);
    assert.equal(f.db.prepare('SELECT balance FROM store_credit_accounts').get().balance,100);
    f.state('processed');f.db.prepare('UPDATE cancellation_refunds SET next_check_at=CURRENT_TIMESTAMP').run();
    await w.processGatewayRefunds(f.env);await w.processGatewayRefunds(f.env);
    assert.equal(f.get().state,'processed');assert.equal(f.posts(),1);
    assert.equal(f.db.prepare('SELECT payment_status FROM orders').get().payment_status,'refunded');
    assert.ok(f.db.prepare("SELECT COUNT(*) AS n FROM customer_notifications WHERE type='cancellation_refund'").get().n>=1);
    assert.equal(f.db.prepare('SELECT balance FROM store_credit_accounts').get().balance,100);
  });
}

test('owner can retry verification before submission, but cannot reset an uncertain financial submission',async t=>{
  const f=fixture(t);const w=await automaticWorker(f);f.cancel();f.verification({amount:1});
  await w.processCancellationRefund(f.env,'cancel-order');assert.equal(f.get().state,'reconciliation_required');assert.equal(f.get().create_attempted,0);
  const id=f.get().id;f.verification({});f.timeout(true);
  const request=new Request('http://127.0.0.1/refund/process',{method:'POST',body:'{}'});
  const owner={email:'owner@example.com',role:'admin',is_owner:true};
  await w.handleCancellationRefund(request,f.env,owner,'cancel-order','process');assert.equal(f.posts(),1);assert.equal(f.get().id,id);
  assert.equal(f.get().create_attempted,1);assert.equal(f.get().state,'reconciliation_required');
  await w.handleCancellationRefund(request,f.env,owner,'cancel-order','process');assert.equal(f.posts(),1);assert.equal(f.get().id,id);
});

test('refund intent and restored credits roll back together if cancellation transaction fails',async t=>{
  const f=fixture(t,{credits:100});
  await assert.rejects(f.env.DB.batch([
    f.env.DB.prepare("UPDATE orders SET status='cancelled' WHERE id='cancel-order'"),
    f.env.DB.prepare("INSERT INTO orders(id,order_number,customer_email,items_json) VALUES('cancel-order','GM-FAIL','buyer@example.com','[]')")
  ]));
  assert.equal(f.db.prepare('SELECT status FROM orders').get().status,'confirmed');assert.equal(f.get(),undefined);
  assert.equal(f.db.prepare('SELECT balance FROM store_credit_accounts').get().balance,0);assert.equal(f.posts(),0);
});

for(const dispatch of ['tracking','shipped']) {
  test(`customer cancellation loses safely when ${dispatch} changes after its initial read`,async t=>{
    const f=fixture(t,{credits:100});const w=await workerFunctions(['cancelOwnOrder']);const batch=f.env.DB.batch;
    f.env.DB.batch=async statements=>{
      f.env.DB.batch=batch;
      f.db.prepare(dispatch==='tracking'?"UPDATE orders SET tracking_number='TRACK-RACE' WHERE id='cancel-order'"
        :"UPDATE orders SET status='shipped' WHERE id='cancel-order'").run();
      return batch(statements);
    };
    const response=await w.cancelOwnOrder(new Request('http://127.0.0.1/cancel',{method:'POST'}),f.env,{email:'buyer@example.com'},'cancel-order');
    assert.equal(response.status,409);assert.equal(f.get(),undefined);assert.equal(f.posts(),0);
    assert.equal(f.db.prepare('SELECT balance FROM store_credit_accounts').get().balance,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM order_stock_releases').get().n,0);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM customer_notifications WHERE type='order_cancelled'").get().n,0);
  });
}
