import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { adminReturnsFixture, owner, staff, customer } from './lib/admin-returns-fixture.mjs';
import { workerFunctions } from './lib/worker-fixture.mjs';
import { saveReturnLogistics,returnDocument } from '../src/return-logistics.js';
import { approveGatewayRefund,executeGatewayRefund,reconcileGatewayRefund } from '../src/gateway-refunds.js';
import { decideCreditRefund } from '../src/store-credits.js';
import { customerReturnView } from '../src/customer-after-sales.js';
import { refundTracking } from '../react-app/src/lib/refundTracking.js';

const req=body=>new Request('http://localhost/api/admin/returns/local',{method:'POST',body:JSON.stringify(body)});
async function fixture(t) {
  const f=await adminReturnsFixture();t.after(()=>f.db.close());
  f.api=await workerFunctions(['confirmWarehouseReceipt','handleGatewayRefund']);
  f.objects=new Map();f.env.RETURN_DOCUMENTS={put:async(key,data)=>f.objects.set(key,data),get:async key=>f.objects.has(key)?{body:f.objects.get(key)}:null,delete:async key=>f.objects.delete(key)};
  f.get=id=>f.worker.getReturnRequest(f.env,id);
  f.approve=async id=>(await (await f.worker.updateReturnRequest(req({status:'approved'}),f.env,owner,id)).json()).request;
  f.shipping={warehouse_address:'Glamia returns warehouse, New Delhi 110001',shipping:{line1:'12 Sample Street',city:'New Delhi',state:'Delhi',pin:'110002'},customer_name:'Meera Shah'};
  return f;
}
async function approvedReturn(f,body={}) {
  const requested=(await (await f.create(body)).json()).request;
  const approved=await f.approve(requested.id);
  await saveReturnLogistics(req({courier_name:'Local courier',tracking_number:'RETURN-0001'}),f.env,approved,owner.email,f.shipping);
  return f.get(approved.id);
}
async function pickup(f,r) {const response=await f.worker.confirmReturnPickup(req({}),f.env,staff,r.id);assert.equal(response.status,200);return (await response.json()).request;}

test('exchange submission creates exactly one linked zero-value order and repeated approval cannot duplicate it',async t=>{
  const f=await fixture(t);
  const r=(await (await f.create({type:'exchange',exchange_line_id:'manual-line',exchange_product_id:f.productId,exchange_from_size:'M',exchange_to_size:'L'})).json()).request;
  assert.ok(r.replacement_order_id);assert.equal(r.status,'approved');assert.equal(r.replacement_fulfilment_mode,'immediate');
  const approvals=await Promise.all([f.approve(r.id),f.approve(r.id)]);
  assert.equal(approvals[0].replacement_order_id,approvals[1].replacement_order_id);
  const row=f.db.prepare("SELECT * FROM orders WHERE order_type='replacement'").get();
  for(const key of ['subtotal','discount','total','payable_total','credits_used'])assert.equal(row[key],0);
  const formatted=(await (await f.worker.listOrders(f.env,customer)).json()).orders.find(o=>o.id===row.id);
  assert.equal(formatted.orderType,'REPLACEMENT');assert.equal(formatted.isReplacement,true);assert.equal(formatted.originalOrderId,'manual-order');
  assert.equal(formatted.shipping_total,0);assert.equal(formatted.tax_total,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action='auto_create_exchange_replacement'").get().n,1);
  assert.equal(f.db.prepare("SELECT stock FROM product_sizes WHERE product_id=? AND size='L'").get(f.productId).stock,5);
  assert.throws(()=>f.db.prepare('UPDATE orders SET total=1 WHERE id=?').run(row.id),/zero value/);
});
test('sold-out exchange submission creates no request, reservation or replacement audit',async t=>{
  const f=await fixture(t);
  f.db.prepare("UPDATE product_sizes SET stock=0 WHERE product_id=? AND size!='M'").run(f.productId);
  const response=await f.create({type:'exchange',exchange_line_id:'manual-line',exchange_product_id:f.productId,exchange_from_size:'M',exchange_to_size:'L'});
  assert.equal(response.status,409);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM return_requests').get().n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM orders WHERE order_type='replacement'").get().n,0);
});
test('generated label contains server-assigned addresses, stays private and supports customer download',async t=>{
  const f=await fixture(t),r=await approvedReturn(f);
  await saveReturnLogistics(req({generate_label:true,warehouse_address:'Forged address'}),f.env,r,owner.email,f.shipping);
  const saved=await f.get(r.id),view=customerReturnView(saved),details=JSON.parse(view.logistics_json).label_details;
  assert.equal(details.warehouse_address,f.shipping.warehouse_address);
  assert.match(details.customer_address,/12 Sample Street/);assert.equal(details.tracking_number,'RETURN-0001');
  assert.equal(view.label_available,true);assert.equal(view.label_key,undefined);
  const response=await returnDocument(f.env,saved,'label');assert.equal(response.headers.get('cache-control'),'private, no-store');
  const pdf=await PDFDocument.load(await response.arrayBuffer());assert.equal(pdf.getPageCount(),1);assert.match(pdf.getTitle(),/return shipping label/);
});
test('generating labels requires an active request, tracking and a configured warehouse',async t=>{
  const f=await fixture(t),r=(await (await f.create()).json()).request;
  await assert.rejects(saveReturnLogistics(req({generate_label:true}),f.env,r,owner.email,f.shipping),/assign courier tracking/);
  const approved=await f.approve(r.id);
  await assert.rejects(saveReturnLogistics(req({generate_label:true,carrier:'Courier',tracking_number:'X'}),f.env,approved,owner.email,{...f.shipping,warehouse_address:''}),/warehouse/);
  assert.equal(f.objects.size,0);
});
test('pickup requires permission and approved tracking; repeated confirmation is immutable and nonfinancial',async t=>{
  const f=await fixture(t),requested=(await (await f.create()).json()).request;
  assert.equal((await f.worker.confirmReturnPickup(req({}),f.env,staff,requested.id)).status,409);
  await assert.rejects(f.worker.confirmReturnPickup(req({}),f.env,customer,requested.id),error=>error.status===403);
  const approved=await f.approve(requested.id);
  assert.equal((await f.worker.confirmReturnPickup(req({}),f.env,staff,approved.id)).status,409);
  await saveReturnLogistics(req({carrier:'Courier',tracking_number:'T1'}),f.env,approved,owner.email);
  const collected=await pickup(f,await f.get(approved.id));
  assert.equal(customerReturnView(collected).returnStatus,'PICKED_UP_BY_COURIER');
  assert.equal(customerReturnView(collected).pickup_confirmed_by,undefined);
  assert.equal((await f.worker.confirmReturnPickup(req({}),f.env,staff,collected.id)).status,200);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action='return_courier_pickup'").get().n,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM gateway_refunds').get().n,0);assert.equal(f.networkCalls(),0);
  assert.throws(()=>f.db.prepare('UPDATE return_requests SET pickup_confirmed_at=NULL WHERE id=?').run(collected.id),/custody evidence/);
  await assert.rejects(saveReturnLogistics(req({carrier:'Another courier'}),f.env,collected,owner.email),/custody/);
});
for(const provider of ['razorpay','phonepe'])test(`${provider}: pickup enables payout, pending is not refunded and confirmation settles once`,async t=>{
  const f=await fixture(t);
  f.db.prepare('UPDATE orders SET payment_method=?,payment_gateway=? WHERE id=?').run(provider,provider,'manual-order');
  let r=await approvedReturn(f);
  await assert.rejects(approveGatewayRefund(f.env.DB,r.id,owner.email),/received/);
  r=await pickup(f,r);let state='pending',posts=0;
  const transport=async(gateway,path,init={})=>{
    if(init.method==='POST'){posts++;return provider==='razorpay'?{id:'rfnd_local',status:'pending'}:{refundId:'local_refund',state:'PENDING'};}
    if(path.startsWith('/payments/pay_local')||path.startsWith('/checkout/'))return provider==='razorpay'?{id:'pay_local',order_id:'order_local',currency:'INR',amount:94950,amount_refunded:0,status:'captured'}:{merchantOrderId:'order_local',amount:94950,state:'COMPLETED',paymentDetails:[{transactionId:'pay_local',state:'COMPLETED'}]};
    const refund=f.db.prepare('SELECT * FROM gateway_refunds').get();
    return provider==='razorpay'?{id:'rfnd_local',entity:'refund',currency:'INR',payment_id:'pay_local',amount:94950,status:state}:{refundId:'local_refund',originalMerchantOrderId:'order_local',merchantRefundId:refund.id,amount:94950,state:state==='pending'?'PENDING':'COMPLETED'};
  };
  const approved=await approveGatewayRefund(f.env.DB,r.id,owner.email);
  await executeGatewayRefund(f.env.DB,approved,transport,owner.email);
  assert.equal((await f.get(r.id)).status,'approved');assert.equal(f.db.prepare('SELECT payment_status FROM orders WHERE id=?').get('manual-order').payment_status,'paid');
  const model=refundTracking(customerReturnView(await f.get(r.id)));assert.equal(model.confirmed,false);assert.equal(model.steps[2].title,'Courier collected');
  state='processed';await reconcileGatewayRefund(f.env.DB,f.db.prepare('SELECT * FROM gateway_refunds').get(),transport,owner.email);
  const settled=await f.get(r.id);assert.equal(settled.status,'refunded');assert.equal(settled.returned_at,null);assert.equal(refundTracking(customerReturnView(settled)).confirmed,true);
  await executeGatewayRefund(f.env.DB,f.db.prepare('SELECT * FROM gateway_refunds').get(),transport,owner.email);assert.equal(posts,1);
  const receipt=await f.api.confirmWarehouseReceipt(req({}),f.env,staff,r.id);assert.equal(receipt.status,200);
  assert.ok((await f.get(r.id)).returned_at);assert.equal((await f.get(r.id)).status,'refunded');
});
test('collected store-credit refund still requires whitelist approval and credits exactly once',async t=>{
  const f=await fixture(t);
  f.db.prepare("INSERT INTO users(google_sub,email,name) VALUES('credit-local',?,'Buyer')").run(customer.email);
  const r=await pickup(f,await approvedReturn(f,{refund_destination:'store_credit'}));
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM store_credit_ledger').get().n,0);
  await assert.rejects(decideCreditRefund(f.env,staff,{whitelisted:false},r.id,'approved'),/whitelisted/);
  await decideCreditRefund(f.env,owner,{whitelisted:true},r.id,'approved');
  await decideCreditRefund(f.env,owner,{whitelisted:true},r.id,'approved');
  assert.equal((await f.get(r.id)).credit_approval_status,'credited');
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM store_credit_ledger WHERE kind='refund'").get().n,1);
});
test('stale logistics save does not overwrite collection or retain its newly generated PDF',async t=>{
  const f=await fixture(t),r=await approvedReturn(f);
  const existingKey=r.label_key;
  await pickup(f,r);
  await assert.rejects(saveReturnLogistics(req({generate_label:true}),f.env,r,owner.email,f.shipping),/changed/);
  assert.equal(f.objects.size,1);assert.ok(f.objects.has(existingKey));assert.equal(JSON.parse((await f.get(r.id)).logistics_json).pickup_status,'collected');
});
test('process-refund route retains whitelist and disabled-execution safeguards',async t=>{
  const f=await fixture(t),r=await pickup(f,await approvedReturn(f));
  await assert.rejects(f.api.handleGatewayRefund(req({}),f.env,staff,r.id,'process'),error=>error.status===403);
  await assert.rejects(f.api.handleGatewayRefund(req({}),f.env,owner,r.id,'process'),error=>error.status===503);
  assert.equal(f.networkCalls(),0);
});

test('approval prepares a server-addressed draft; saving tracking generates the PDF without a second action',async t=>{
  const f=await fixture(t);
  f.db.prepare("UPDATE storefront_settings SET value_json=? WHERE setting_key='fulfillment'").run(JSON.stringify({warehouse_address:f.shipping.warehouse_address}));
  f.db.prepare('UPDATE orders SET shipping_json=? WHERE id=?').run(JSON.stringify(f.shipping.shipping),'manual-order');
  const requested=(await (await f.create()).json()).request,r=await f.approve(requested.id);
  assert.equal(r.label_available,false);
  const draft=JSON.parse(r.logistics_json);
  assert.equal(draft.label_details.warehouse_address,f.shipping.warehouse_address);
  assert.equal(draft.label_details.tracking_number,'');assert.match(draft.label_status_message,/awaiting courier/);
  await saveReturnLogistics(req({carrier:'Courier',tracking_number:'AUTO-1'}),f.env,r,owner.email,f.shipping);
  const saved=await f.get(r.id);assert.equal(saved.label_available,true);assert.equal(saved.trackingNumber,'AUTO-1');assert.equal(f.objects.size,1);
  await saveReturnLogistics(req({instructions:'Pack safely'}),f.env,saved,owner.email,f.shipping);
  assert.equal((await f.get(r.id)).label_key,saved.label_key);assert.equal(f.objects.size,1,'Instruction-only edits do not regenerate PDFs');
});

test('tracking edits regenerate generated labels; uploaded courier PDFs are preserved unless the booking changes',async t=>{
  const f=await fixture(t);let r=await approvedReturn(f);
  await saveReturnLogistics(req({tracking_number:'AUTO-2'}),f.env,r,owner.email,f.shipping);
  const changed=await f.get(r.id);assert.notEqual(changed.label_key,r.label_key);
  assert.equal(JSON.parse(changed.logistics_json).label_details.tracking_number,'AUTO-2');
  await saveReturnLogistics(req({tracking_number:''}),f.env,changed,owner.email,f.shipping);
  const draft=await f.get(r.id);assert.equal(draft.label_available,false);
  await saveReturnLogistics(req({tracking_number:'AUTO-2'}),f.env,draft,owner.email,f.shipping);
  const pdf=await PDFDocument.create();pdf.addPage();const upload=Buffer.from(await pdf.save()).toString('base64');
  await saveReturnLogistics(req({label_base64:upload}),f.env,await f.get(r.id),owner.email,f.shipping);
  r=await f.get(r.id);assert.equal(JSON.parse(r.logistics_json).label_details,undefined);
  await saveReturnLogistics(req({instructions:'Courier label applies'}),f.env,r,owner.email,f.shipping);
  assert.equal((await f.get(r.id)).label_key,r.label_key);
  await saveReturnLogistics(req({tracking_number:''}),f.env,await f.get(r.id),owner.email,f.shipping);
  assert.equal((await f.get(r.id)).label_available,false,'An old courier PDF is not available against an incomplete new booking');
});

test('missing PDF storage preserves approval and tracking with an actionable label status',async t=>{
  const f=await fixture(t);delete f.env.RETURN_DOCUMENTS;
  const r=await f.approve((await (await f.create()).json()).request.id);
  await saveReturnLogistics(req({carrier:'Courier',tracking_number:'T1'}),f.env,r,owner.email,f.shipping);
  const saved=await f.get(r.id);assert.equal(saved.status,'approved');assert.equal(saved.label_available,false);
  assert.equal(JSON.parse(saved.logistics_json).tracking_number,'T1');
  assert.match(JSON.parse(saved.logistics_json).label_status_message,/needs attention/);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM gateway_refunds').get().n,0);
});

test('completed admin records include delivered zero-value replacements, not pending ones',async t=>{
  const f=await fixture(t);
  const r=await f.approve((await (await f.create({type:'exchange',exchange_line_id:'manual-line',exchange_product_id:f.productId,exchange_from_size:'M',exchange_to_size:'L'})).json()).request.id);
  const params=new URLSearchParams('completed=1&limit=30');
  const completed=async()=>(await (await f.worker.listOrders(f.env,owner,'admin',params)).json());
  const before=await completed();assert.equal(before.orders.some(o=>o.id===r.replacement_order_id),false);
  await f.worker.updateReturnRequest(req({status:'received'}),f.env,owner,r.id);
  f.db.prepare("UPDATE orders SET packing_status='packed',status='delivered' WHERE id=?").run(r.replacement_order_id);
  const result=await completed();const replacement=result.orders.find(o=>o.id===r.replacement_order_id);
  assert.ok(replacement);assert.equal(replacement.total,0);assert.equal(replacement.bill_number,null);
  assert.equal(replacement.original_order_id,'manual-order');assert.equal(result.pagination.total,before.pagination.total+1);
  const searched=(await (await f.worker.listOrders(f.env,owner,'admin',new URLSearchParams('completed=1&limit=30&q=Meera'))).json());
  assert.ok(searched.orders.some(o=>o.id===r.replacement_order_id));
  assert.equal(searched.pagination.total,2,'Both the original purchase and its delivered replacement match this customer');
  const absent=(await (await f.worker.listOrders(f.env,owner,'admin',new URLSearchParams('completed=1&limit=30&q=Nobody'))).json());
  assert.equal(absent.pagination.total,0);
});
