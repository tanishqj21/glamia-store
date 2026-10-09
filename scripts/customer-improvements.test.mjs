import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localDatabase,workerFunctions} from './lib/worker-fixture.mjs';
import {remainingReturnLines,selectReturnLines} from '../src/customer-after-sales.js';
import {selectedVariantCopy} from '../src/product-trust.js';
import {customerPromises,deliveryPromise} from '../src/customer-promises.js';
import {approveGatewayRefund,executeGatewayRefund} from '../src/gateway-refunds.js';
import {saveReturnLogistics} from '../src/return-logistics.js';

function orderFixture(t,options={}){
  const f=localDatabase(options);t.after(()=>f.db.close());
  f.db.exec("INSERT INTO users(google_sub,email,name,role) VALUES('cx','cx@example.com','Customer','seller')");
  f.db.exec("INSERT INTO store_credit_accounts(user_email,balance) VALUES('cx@example.com',100)");
  f.db.exec("INSERT INTO orders(id,order_number,customer_email,items_json,subtotal,total,status,payment_method,payment_status,shipping_json,credits_used,payable_total,payment_gateway,gateway_order_id,gateway_payment_id) VALUES('cx-order','GM-CX','cx@example.com','[]',400,400,'delivered','razorpay','paid','{}',100,300,'razorpay','order_cx','pay_cx')");
  return f;
}
test('successive unit allocations preserve every paise and exclude consumed units',()=>{
  const lines=[{id:'line',product_id:'p',product_name:'Piece',quantity:3,unit_price:100,returnable_snapshot:1}];
  const first=selectReturnLines(lines,[{line_id:'line',quantity:1}],299.99);
  const remaining=remainingReturnLines(lines,[{status:'refunded',selected_items_json:JSON.stringify(first)}]);
  assert.equal(remaining[0].remaining_quantity,2);
  const second=selectReturnLines(remaining,[{line_id:'line',quantity:2}],299.99);
  assert.equal(first[0].amount_paise+second[0].amount_paise,29999);
  assert.throws(()=>selectReturnLines(remaining,[{line_id:'line',quantity:3}],299.99));
  assert.equal(remainingReturnLines(lines,[{status:'refunded',selected_items_json:'[]'}])[0].remaining_quantity,0);
  assert.equal(remainingReturnLines(lines,[{status:'rejected',selected_items_json:JSON.stringify(first)}])[0].remaining_quantity,3);
});
test('variant copy uses selected identity without changing unrelated specifications',()=>{
  const result=selectedVariantCopy({name:'Night Suit — Sage Green',color:'Sage Green',description:'Wine colour with soft fleece.',specifications:'Product: Chocolate Brown suit\nColour: Wine\nMaterial: Fleece'},['Wine','Sage Green']);
  assert.match(result.description,/Sage Green/);assert.doesNotMatch(result.specifications,/Chocolate Brown|Wine/);assert.match(result.specifications,/Material: Fleece/);
});
test('delivery settings are bounded and shared estimates do not claim serviceability',()=>{
  assert.equal(customerPromises(null).support_hours,48);
  const text=deliveryPromise('Delhi',{delhi_min:3,delhi_max:5});assert.match(text,/3–5/);assert.match(text,/not courier-confirmed/);
});
test('refund table migration preserves populated financial cases and immutable events with foreign keys enabled',async t=>{
  const {db,env}=orderFixture(t,{through:'0104_cancellation_refunds.sql',foreignKeys:true});
  db.exec("INSERT INTO return_requests(id,order_id,customer_email,type,reason,status,refund_amount,refund_destination) VALUES('r1','cx-order','cx@example.com','refund','Test','received',200,'original')");
  const first=await approveGatewayRefund(env.DB,'r1','owner@example.com');
  const before=db.prepare('SELECT * FROM gateway_refunds').all();const events=db.prepare('SELECT * FROM gateway_refund_events').all();
  db.exec('BEGIN');
  try{db.exec(readFileSync(new URL('../migrations/0105_successive_item_returns.sql',import.meta.url),'utf8'));db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  assert.deepEqual(db.prepare('SELECT * FROM gateway_refunds').all(),before);
  assert.deepEqual(db.prepare('SELECT * FROM gateway_refund_events').all(),events);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.throws(()=>db.prepare('DELETE FROM gateway_refunds WHERE id=?').run(first.id),/retained/);
});
for(const provider of ['razorpay','phonepe'])test(`${provider}: two partial refunds restore the entire split exactly once`,async t=>{
  const {db,env}=orderFixture(t);
  db.prepare('UPDATE orders SET payment_method=?,payment_gateway=?').run(provider,provider);
  let posts=0;
  const transport=async(gateway,path,init={})=>{
    if(init.method==='POST'){posts++;return gateway==='razorpay'?{id:`rfnd_cx${posts}`}:{refundId:`phonepe${posts}`};}
    const all=db.prepare('SELECT * FROM gateway_refunds').all();
    if(path.startsWith('/payments/pay_cx')||path.startsWith('/checkout/'))return gateway==='razorpay'?{id:'pay_cx',order_id:'order_cx',currency:'INR',status:'captured',amount:30000,amount_refunded:all.filter(r=>r.state==='processed').reduce((sum,r)=>sum+r.gateway_paise,0)}:{merchantOrderId:'order_cx',amount:30000,state:'COMPLETED',paymentDetails:[{transactionId:'pay_cx',state:'COMPLETED'}]};
    const r=all.find(r=>path.includes(encodeURIComponent(gateway==='razorpay'?r.provider_refund_id||'no-match':r.id)));
    assert.ok(r,'known refund status read');
    return gateway==='razorpay'?{id:r.provider_refund_id,entity:'refund',currency:'INR',payment_id:'pay_cx',amount:r.gateway_paise,status:'processed'}:{refundId:r.provider_refund_id,originalMerchantOrderId:'order_cx',merchantRefundId:r.id,amount:r.gateway_paise,state:'COMPLETED'};
  };
  for(const [id,amount] of [['r1',199.99],['r2',200.01]]){
    db.prepare("INSERT INTO return_requests(id,order_id,customer_email,type,reason,status,refund_amount,refund_destination) VALUES(?,'cx-order','cx@example.com','refund','Test','received',?,'original')").run(id,amount);
    const approved=await approveGatewayRefund(env.DB,id,'owner@example.com');
    await executeGatewayRefund(env.DB,approved,transport,'owner@example.com');
    assert.equal(db.prepare('SELECT state FROM gateway_refunds WHERE id=?').get(approved.id).state,'processed');
  }
  assert.equal(posts,2);assert.equal(db.prepare('SELECT payment_status FROM orders').get().payment_status,'refunded');
  assert.equal(db.prepare('SELECT SUM(amount) AS total FROM store_credit_ledger WHERE kind=\'refund\'').get().total,100);
  assert.equal(db.prepare('SELECT SUM(gateway_paise) AS total FROM gateway_refunds').get().total,30000);
});
test('catalogue prices and sorting use active deals, never invented review ratings',async t=>{
  const {db,env}=localDatabase();t.after(()=>db.close());
  db.exec("INSERT INTO products(id,name,seller_email,brand,description,color,sizes_json,image_url,category,price,mrp,stock,status,rating,deal_price,deal_starts_at,deal_ends_at) VALUES('cx-cheap','Cheap','cx@example.com','Glamia','Test','Sage Green','[\"M\"]','/image.png','Women',300,350,3,'live',5,100,datetime('now','-1 day'),datetime('now','+1 day')),('cx-other','Other','cx@example.com','Glamia','Test','Sage Green','[\"M\"]','/image.png','Women',200,250,3,'live',5,NULL,NULL,NULL)");
  const worker=await workerFunctions(['listProducts']);
  const response=await worker.listProducts(env,null,'public',new URLSearchParams('view=cards&limit=24&min_price=90&max_price=150&sort=price_low&facets=1'));
  const data=await response.json();assert.equal(response.status,200);assert.deepEqual(data.products.map(p=>p.id),['cx-cheap']);assert.equal(data.products[0].rating,0);assert.equal(data.pagination.total,1);
});

test('return quantities are protected transactionally including duplicate entries and legacy whole-order cases',t=>{
  const {db}=orderFixture(t);
  db.exec("INSERT INTO order_items(id,order_id,product_id,product_name,unit_price,quantity,size) VALUES('line','cx-order','p','Piece',100,3,'M')");
  const insert=(id,items,status='requested')=>db.prepare("INSERT INTO return_requests(id,order_id,customer_email,type,reason,status,selected_items_json,refund_destination) VALUES(?,'cx-order','cx@example.com','refund','Test',?,?,'original')").run(id,status,JSON.stringify(items));
  assert.throws(()=>insert('duplicate',[{line_id:'line',quantity:2},{line_id:'line',quantity:2}]),/quantity already/);
  assert.throws(()=>insert('fraction',[{line_id:'line',quantity:1.5}]),/quantity already/);
  insert('first',[{line_id:'line',quantity:1}],'refunded');
  insert('second',[{line_id:'line',quantity:2}],'completed');
  assert.throws(()=>insert('third',[{line_id:'line',quantity:1}]),/quantity already/);
  db.exec("INSERT INTO orders(id,order_number,customer_email,items_json,subtotal,total,status,payment_method,payment_status) VALUES('legacy','GM-LEGACY','cx@example.com','[]',100,100,'delivered','demo','paid')");
  db.exec("INSERT INTO return_requests(id,order_id,customer_email,type,reason,status,selected_items_json) VALUES('old','legacy','cx@example.com','refund','Legacy','refunded','[]')");
  assert.throws(()=>db.prepare("INSERT INTO return_requests(id,order_id,customer_email,type,reason,status,selected_items_json) VALUES('new','legacy','cx@example.com','refund','Test','requested',?)").run(JSON.stringify([{line_id:'line',quantity:1}])),/quantity already/);
});

test('manual courier URLs reject lookalikes, credentials and invalid next-update dates before saving',async()=>{
  const request=body=>new Request('http://localhost/logistics',{method:'POST',body:JSON.stringify(body)});
  for(const tracking_url of ['https://delhivery.com.evil.example/','http://delhivery.com/','https://user:pass@delhivery.com/','https://delhivery.com:8443/','javascript:alert(1)']){
    await assert.rejects(()=>saveReturnLogistics(request({tracking_url}),{}, {status:'approved'},'owner'),/tracking|HTTPS/);
  }
  await assert.rejects(()=>saveReturnLogistics(request({next_update_at:'not-a-date'}),{}, {status:'approved'},'owner'),/next-update/);
});

test('late captured cancelled payments get one durable intent without reopening fulfilment or submitting money when disabled',async t=>{
  const {db,env}=orderFixture(t);env.GATEWAY_REFUNDS_ENABLED='false';env.DISABLE_OUTBOUND_PUSH='true';
  db.exec("UPDATE orders SET payment_status='pending',credits_used=0,payable_total=400 WHERE id='cx-order'; UPDATE orders SET status='cancelled' WHERE id='cx-order'");
  const worker=await workerFunctions(['notifyLateGatewayPayment']);
  const row=db.prepare('SELECT * FROM orders').get();
  await worker.notifyLateGatewayPayment(env,row,'pay_cx',true);
  await worker.notifyLateGatewayPayment(env,db.prepare('SELECT * FROM orders').get(),'pay_cx',true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cancellation_refunds').get().n,1);
  assert.equal(db.prepare('SELECT state FROM cancellation_refunds').get().state,'approved');
  assert.equal(db.prepare('SELECT status FROM orders').get().status,'cancelled');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM gateway_refunds').get().n,0);
});

test('overdue support escalation is owner-scoped, deduplicated and loses to a concurrent care reply',async t=>{
  const {db,env}=localDatabase();t.after(()=>db.close());env.DISABLE_OUTBOUND_PUSH='true';
  db.exec("INSERT INTO support_tickets(id,ticket_number,customer_email,subject,message,created_at) VALUES('t1','GM-SUPPORT-1','cx@example.com','Help','Question',datetime('now','-3 days'))");
  db.exec("INSERT INTO support_messages(id,ticket_id,sender_role,sender_email,message,created_at) VALUES('m1','t1','customer','cx@example.com','Question',datetime('now','-3 days'))");
  const worker=await workerFunctions(['escalateOwnSupportTicket']);
  assert.equal((await worker.escalateOwnSupportTicket(env,{email:'other@example.com'},'t1')).status,404);
  assert.equal((await worker.escalateOwnSupportTicket(env,{email:'cx@example.com'},'t1')).status,200);
  assert.equal((await worker.escalateOwnSupportTicket(env,{email:'cx@example.com'},'t1')).status,409);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_notifications WHERE dedupe_key LIKE 'support-escalate:%'").get().n,1);
  db.exec("UPDATE support_tickets SET priority='normal' WHERE id='t1'");
  const original=env.DB.prepare.bind(env.DB);let injected=false;
  env.DB.prepare=sql=>{if(sql.startsWith('UPDATE support_tickets SET priority=')&&!injected){injected=true;db.exec("INSERT INTO support_messages(id,ticket_id,sender_role,sender_email,message) VALUES('m2','t1','admin','care@example.com','Here is your update')");}return original(sql);};
  assert.equal((await worker.escalateOwnSupportTicket(env,{email:'cx@example.com'},'t1')).status,409);
  assert.equal(db.prepare('SELECT priority FROM support_tickets').get().priority,'normal');
});

test('web and mobile delivery definitions stay identical',()=>{
  assert.equal(readFileSync(new URL('../glamia-shoppers-app/src/customerPromises.js',import.meta.url),'utf8').trim(),readFileSync(new URL('../src/customer-promises.js',import.meta.url),'utf8').trim());
});

test('storefront delivery targets persist publicly, preserve custom copy and reject inverted ranges',async t=>{
  const {db,env}=localDatabase();t.after(()=>db.close());
  db.prepare('INSERT INTO storefront_settings(setting_key,value_json) VALUES(?,?) ON CONFLICT(setting_key) DO UPDATE SET value_json=excluded.value_json').run('trust_strip',JSON.stringify({items:[{id:'returns',body:'Simple exchanges, no questions'}]}));
  const worker=await workerFunctions(['updateStorefrontSettings','getStorefrontSettings']);
  const request=body=>new Request('http://localhost/api/admin/storefront-settings',{method:'PUT',body:JSON.stringify(body)});
  const changed=await worker.updateStorefrontSettings(request({customer_experience:{dispatch_min:3,dispatch_max:5,support_hours:24}}),env);
  assert.equal(changed.status,200);
  const view=await (await worker.getStorefrontSettings(env)).json();assert.equal(view.customer_experience.dispatch_min,3);assert.equal(view.customer_experience.support_hours,24);
  assert.doesNotMatch(view.trust_strip.items.find(item=>item.id==='returns').body,/no questions/);
  await assert.rejects(()=>worker.updateStorefrontSettings(request({customer_experience:{dispatch_min:6,dispatch_max:2}}),env),/minimum/);
  db.prepare('UPDATE storefront_settings SET value_json=? WHERE setting_key=?').run(JSON.stringify({items:[{id:'returns',body:'Contact our care team for a size change.'}]}),'trust_strip');
  const custom=await (await worker.getStorefrontSettings(env)).json();assert.equal(custom.trust_strip.items.find(item=>item.id==='returns').body,'Contact our care team for a size change.');
});
