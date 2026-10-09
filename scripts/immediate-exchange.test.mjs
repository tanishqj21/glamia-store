// In-memory D1 only. No live orders, courier bookings or payment execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adminReturnsFixture, owner, customer } from './lib/admin-returns-fixture.mjs';
import { workerFunctions } from './lib/worker-fixture.mjs';
import { saveReturnLogistics, returnDocument } from '../src/return-logistics.js';

const exchange={type:'exchange',reason:'Please exchange the purchased size',exchange_line_id:'manual-line',exchange_to_size:'L',items:[{line_id:'manual-line',quantity:1}]};
async function fixture(t){
  const f=await adminReturnsFixture();t.after(()=>f.db.close());
  f.api=await workerFunctions(['createReplacementOrder','listEmployeeOrders','markEmployeeOrderPacked','employeeDashboard','updateOrderStatus','confirmWarehouseReceipt','getReturnRequest']);
  f.objects=new Map();f.env.RETURN_DOCUMENTS={put:async(key,body)=>f.objects.set(key,body),get:async key=>f.objects.has(key)?{body:f.objects.get(key)}:null,delete:async key=>f.objects.delete(key)};
  f.context={shipping:{line1:'12 Sample Street',city:'New Delhi',state:'Delhi',pin:'110002'},warehouse_address:'Glamia warehouse, New Delhi 110001',customer_name:'Meera Shah'};
  f.db.prepare('UPDATE orders SET shipping_json=? WHERE id=?').run(JSON.stringify(f.context.shipping),'manual-order');
  f.db.prepare("UPDATE storefront_settings SET value_json=? WHERE setting_key='fulfillment'").run(JSON.stringify({warehouse_address:f.context.warehouse_address}));
  f.submit=()=>f.worker.createReturnRequest(f.request(exchange),f.env,customer,'manual-order');
  return f;
}
const patch=body=>new Request('http://localhost/local',{method:'PATCH',body:JSON.stringify(body)});

test('concurrent submissions create one replacement/stock debit/audit and notify admin to arrange pickup',async t=>{
  const f=await fixture(t);
  const responses=await Promise.all([f.submit(),f.submit(),f.create(exchange)]);
  assert.equal(responses.filter(r=>r.status===201).length,1);assert.equal(responses.filter(r=>r.status===409).length,2);
  const data=await responses.find(r=>r.status===201).json();
  assert.equal(data.request.status,'approved');assert.equal(data.request.returned_at,null);assert.equal(data.request.label_available,false);
  assert.ok(JSON.parse(data.request.logistics_json).label_details);
  assert.equal(data.replacement_order.replacement_fulfilment_mode,'immediate');assert.equal(data.replacement_order.original_order_id,'manual-order');
  for(const field of ['subtotal','discount','tax_total','shipping_total','total','payable_total','credits_used'])assert.equal(data.replacement_order[field],0);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM orders WHERE order_type='replacement'").get().n,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM inventory_reservations').get().n,1);
  assert.equal(f.db.prepare("SELECT stock FROM product_sizes WHERE product_id=? AND size='L'").get(f.productId).stock,5);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action='auto_create_exchange_replacement'").get().n,1);
  const notice=f.db.prepare("SELECT * FROM admin_notifications WHERE type='exchange_request'").get();
  assert.equal(notice.title,'Arrange exchange return pickup');assert.match(notice.message,/customer to the warehouse/);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM gateway_refunds').get().n,0);assert.equal(f.networkCalls(),0);
});

test('audit failure rolls back exchange claim, replacement and stock together',async t=>{
  const f=await fixture(t);
  f.db.exec("CREATE TRIGGER deny_replacement_audit BEFORE INSERT ON admin_audit_log WHEN NEW.action='auto_create_exchange_replacement' BEGIN SELECT RAISE(ABORT,'Local audit failure'); END;");
  await assert.rejects(f.submit(),/Local audit failure/);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM return_requests').get().n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM orders WHERE order_type='replacement'").get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM inventory_reservations').get().n,0);
  assert.equal(f.db.prepare("SELECT stock FROM product_sizes WHERE product_id=? AND size='L'").get(f.productId).stock,6);
});

test('stock race aborts the complete exchange transaction, not just the replacement',async t=>{
  const f=await fixture(t),batch=f.env.DB.batch;
  let once=true;
  f.env.DB.batch=statements=>{if(once){once=false;f.db.prepare("UPDATE product_sizes SET stock=0 WHERE product_id=? AND size='L'").run(f.productId);}return batch(statements);};
  assert.equal((await f.submit()).status,409);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM return_requests').get().n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM orders WHERE order_type='replacement'").get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM inventory_reservations').get().n,0);
  assert.equal(f.db.prepare('SELECT stock FROM products WHERE id=?').get(f.productId).stock,10);
});

test('packing sees a regular order; customer/admin retain replacement identity and dispatch needs no return receipt',async t=>{
  const f=await fixture(t),data=await (await f.submit()).json(),id=data.replacement_order.id;
  const queue=(await (await f.api.listEmployeeOrders(f.env,'unpacked',{})).json()).orders.find(o=>o.id===id);
  assert.ok(queue);assert.equal(queue.order_type,'standard');assert.equal(queue.isReplacement,undefined);assert.equal(queue.originalOrderId,undefined);
  assert.equal((await (await f.api.employeeDashboard(f.env)).json()).stats.unpacked_orders,2);
  const own=(await (await f.worker.listOrders(f.env,customer)).json()).orders.find(o=>o.id===id);
  const admin=(await (await f.worker.listOrders(f.env,owner,'admin')).json()).orders.find(o=>o.id===id);
  assert.equal(own.isReplacement,true);assert.equal(admin.isReplacement,true);
  assert.equal((await f.api.markEmployeeOrderPacked(f.env,id,{employee:{id:'packer',name:'Packer'}})).status,200);
  assert.equal((await f.api.updateOrderStatus(patch({status:'shipped'}),f.env,id,owner)).status,200);
  assert.equal((await f.api.updateOrderStatus(patch({status:'delivered'}),f.env,id,owner)).status,200);
  assert.equal((await f.api.getReturnRequest(f.env,data.request.id)).status,'approved','Delivery must not close an uncollected return');
  assert.equal((await f.api.confirmWarehouseReceipt(patch({}),f.env,owner,data.request.id)).status,200);
  assert.equal((await f.api.getReturnRequest(f.env,data.request.id)).status,'completed');
});

for(const type of ['refund','exchange'])test(`${type}: submission prepares label and pickup alert; tracking publishes PDF without approving a refund`,async t=>{
  const f=await fixture(t),data=await (await (type==='exchange'?f.submit():f.create())).json(),r=data.request;
  assert.equal(r.label_available,false);assert.ok(JSON.parse(r.logistics_json).label_details);
  await saveReturnLogistics(patch({carrier:'Local courier',tracking_number:'RETURN-101'}),f.env,r,owner.email,f.context);
  const saved=await f.api.getReturnRequest(f.env,r.id);
  assert.equal(saved.label_available,true);assert.equal(saved.trackingNumber,'RETURN-101');
  assert.equal(saved.status,type==='exchange'?'approved':'requested');
  const own=(await (await f.worker.listReturns(f.env,customer,'own')).json()).requests[0];
  assert.equal(own.label_available,true);assert.equal(own.label_key,undefined);assert.equal(own.trackingNumber,'RETURN-101');
  const document=await returnDocument(f.env,saved,'label');assert.equal(document.headers.get('cache-control'),'private, no-store');
  assert.equal(new TextDecoder().decode(new Uint8Array(await document.arrayBuffer()).slice(0,5)),'%PDF-');
  const notice=f.db.prepare('SELECT title,message FROM admin_notifications WHERE type=?').get(type==='exchange'?'exchange_request':'return_request');
  assert.match(notice.title,/Arrange.*pickup/);assert.match(notice.message,/save courier tracking/);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM gateway_refunds').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM store_credit_ledger').get().n,0);
});

test('new migration preserves historical receipt holds and is repeatable for its guards',async t=>{
  const f=await fixture(t);
  f.db.prepare("INSERT INTO return_requests(id,order_id,customer_email,type,reason,exchange_product_id,exchange_from_size,exchange_to_size) VALUES('legacy','manual-order',?,'exchange','Earlier request',?,'M','L')").run(customer.email,f.productId);
  const order=f.db.prepare("SELECT * FROM orders WHERE id='manual-order'").get();
  const legacy=await f.api.createReplacementOrder(f.env,order,{id:f.productId,quantity:1},'L','legacy',{actor:owner.email,notes:''});
  const before=f.db.prepare('SELECT * FROM orders WHERE id=?').get(legacy.id);
  const migration=readFileSync(new URL('../migrations/0103_immediate_exchange_orders.sql',import.meta.url),'utf8');
  const guards=migration.slice(migration.indexOf('DROP TRIGGER IF EXISTS replacement_fulfilment_mode_immutable'));
  f.db.exec(guards);f.db.exec(guards);
  assert.deepEqual(f.db.prepare('SELECT * FROM orders WHERE id=?').get(legacy.id),before);
  assert.equal(legacy.replacement_fulfilment_mode,'after_receipt');
  assert.equal((await f.api.markEmployeeOrderPacked(f.env,legacy.id,{employee:{id:'packer'}})).status,409);
  assert.throws(()=>f.db.prepare("UPDATE orders SET replacement_fulfilment_mode='immediate' WHERE id=?").run(legacy.id),/policy cannot be replaced/);
});
