import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adminReturnsFixture,owner,customer} from './lib/admin-returns-fixture.mjs';
import {workerFunctions} from './lib/worker-fixture.mjs';
import {selectReturnLines,customerReturnView} from '../src/customer-after-sales.js';
import {refundTracking} from '../react-app/src/lib/refundTracking.js';
import {saveReturnLogistics,returnDocument} from '../src/return-logistics.js';

async function fixture(t,options) {
  const f=await adminReturnsFixture(options);t.after(()=>f.db.close());
  const api=await workerFunctions(['listEmployeeOrders','getEmployeeOrder','markEmployeeOrderPacked','updateOrderStatus','updateReturnRequest','customerOrderReturnOptions','getReturnRequest','listSupportTickets','listSupportMessages','createReturnDocumentAccess','consumeReturnDocumentAccess']);
  return {...f,api};
}
const change=(status,extra={})=>new Request('http://localhost/api/admin/returns/local',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status,...extra})});
async function exchange(f){const requested=(await (await f.create({type:'exchange',exchange_line_id:'manual-line',exchange_product_id:f.productId,exchange_from_size:'M',exchange_to_size:'L',items:[{line_id:'manual-line',quantity:1}]})).json()).request;return (await (await f.api.updateReturnRequest(change('approved'),f.env,owner,requested.id)).json()).request;}

test('release migration reconciles earlier production guards and is repeatable without changing order data',async t=>{
  const f=await fixture(t);
  const before=f.db.prepare("SELECT * FROM orders WHERE id='manual-order'").get();
  f.db.exec(`DROP TRIGGER valid_replacement_case; DROP TRIGGER complete_delivered_exchange;
    DROP TRIGGER selected_refund_ceiling; DROP TABLE return_document_tokens;`);
  const migration=readFileSync(new URL('../migrations/0101_after_sales_release_guards.sql',import.meta.url),'utf8');
  f.db.exec(migration); f.db.exec(migration);
  const latest=readFileSync(new URL('../migrations/0102_return_pickup_lifecycle.sql',import.meta.url),'utf8');
  f.db.exec('DROP TRIGGER valid_replacement_case;'+latest.slice(latest.indexOf('CREATE TRIGGER valid_replacement_case'),latest.indexOf('CREATE TRIGGER replacement_zero_totals')));
  const immediate=readFileSync(new URL('../migrations/0103_immediate_exchange_orders.sql',import.meta.url),'utf8');
  f.db.exec(immediate.slice(immediate.indexOf('DROP TRIGGER IF EXISTS replacement_fulfilment_mode_immutable')));
  assert.deepEqual(f.db.prepare("SELECT * FROM orders WHERE id='manual-order'").get(),before);
  for(const name of ['valid_replacement_case','hold_replacement_fulfilment','complete_delivered_exchange','selected_refund_ceiling','return_document_tokens'])assert.ok(f.db.prepare('SELECT name FROM sqlite_master WHERE name=?').get(name));
  const r=await exchange(f);
  assert.equal((await f.api.updateReturnRequest(change('rejected',{notes:'Customer changed the request before dispatch'}),f.env,owner,r.id)).status,200);
  assert.equal(f.db.prepare('SELECT status FROM orders WHERE id=?').get(r.replacement_order_id).status,'cancelled');
});

test('new exchanges enter packing without approval or receipt; cancellation restores undispatched stock once',async t=>{
  const f=await fixture(t),r=await exchange(f);
  const session={employee:{id:'local-packer',name:'Local packer'}};
  const queue=(await (await f.api.listEmployeeOrders(f.env,'all',session)).json()).orders.find(o=>o.id===r.replacement_order_id);
  assert.ok(queue);assert.equal(queue.order_type,'standard');assert.equal(queue.is_replacement,undefined);assert.equal(queue.original_order_id,undefined);
  assert.equal((await f.api.getEmployeeOrder(f.env,r.replacement_order_id,session)).status,200);
  assert.equal((await f.api.markEmployeeOrderPacked(f.env,r.replacement_order_id,session)).status,200);
  assert.equal((await f.api.getReturnRequest(f.env,r.id)).returned_at,null);
  assert.equal((await f.api.updateReturnRequest(change('rejected',{notes:'Customer chose a refund instead of exchanging'}),f.env,owner,r.id)).status,200);
  assert.equal(f.db.prepare('SELECT status FROM orders WHERE id=?').get(r.replacement_order_id).status,'cancelled');
  assert.equal(f.db.prepare("SELECT stock FROM product_sizes WHERE product_id=? AND size='L'").get(f.productId).stock,6);
  await f.api.updateReturnRequest(change('rejected'),f.env,owner,r.id);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM order_stock_releases WHERE order_id=?').get(r.replacement_order_id).n,1);
});

test('replacement can ship before pickup; dispatched stock is protected and exchange closes only after both legs finish',async t=>{
  const f=await fixture(t),r=await exchange(f);
  assert.equal((await f.api.updateReturnRequest(change('approved'),f.env,owner,r.id)).status,200);
  assert.equal((await (await f.api.listEmployeeOrders(f.env,'unpacked',{})).json()).orders.some(o=>o.id===r.replacement_order_id),true);
  assert.equal((await f.api.updateOrderStatus(change('shipped'),f.env,r.replacement_order_id,owner)).status,200);
  assert.equal((await f.api.updateReturnRequest(change('rejected',{notes:'This must not release dispatched inventory'}),f.env,owner,r.id)).status,409);
  assert.equal((await f.api.updateOrderStatus(change('delivered'),f.env,r.replacement_order_id,owner)).status,200);
  assert.equal((await f.api.getReturnRequest(f.env,r.id)).status,'approved');
  assert.equal((await f.api.updateReturnRequest(change('received'),f.env,owner,r.id)).status,200);
  assert.equal((await f.api.getReturnRequest(f.env,r.id)).status,'completed');
});

test('customer contracts redact staff notes, refund actors and raw gateway diagnostics',async t=>{
  const f=await fixture(t),r=(await (await f.create()).json()).request;
  f.db.prepare("UPDATE return_requests SET automatic_refund_error='provider private details',credit_approved_by='private-owner@example.com' WHERE id=?").run(r.id);
  const data=await (await f.worker.listReturns(f.env,customer,'own')).json();
  assert.equal(data.requests[0].refund_state,'review_required');
  assert.equal(data.requests[0].credit_approved_by,undefined);
  assert.equal(data.requests[0].automatic_refund_error,undefined);
  const view=customerReturnView({id:'r',gateway_refund:{state:'failed',last_error:'secret',approved_by:'owner',provider_refund_id:'rfnd_test'}});
  assert.equal(view.gateway_refund.last_error,undefined);
  f.db.prepare("INSERT INTO support_tickets(id,ticket_number,customer_email,subject,message,admin_note) VALUES('ticket','GM-TICKET',?,'Local support','Customer message','private staff note')").run(customer.email);
  const own=await (await f.api.listSupportTickets(f.env,customer,'own')).json();
  const internal=await (await f.api.listSupportTickets(f.env,owner,'admin')).json();
  assert.equal(own.tickets[0].admin_note,undefined);assert.equal(internal.tickets[0].admin_note,'private staff note');
  f.db.prepare("INSERT INTO support_messages(id,ticket_id,sender_role,sender_email,message) VALUES('reply','ticket','admin','private-owner@example.com','Here are the return instructions')").run();
  const messages=await (await f.api.listSupportMessages(f.env,customer,'ticket')).json();
  assert.equal(messages.messages[0].sender_email,undefined);
  assert.equal(messages.messages[0].message,'Here are the return instructions');
});

test('partial quantity snapshots exact paise and cannot be increased by forged amounts',async t=>{
  const f=await fixture(t);
  f.db.prepare("UPDATE order_items SET quantity=2,unit_price=474.75 WHERE id='manual-line'").run();
  const response=await f.create({items:[{line_id:'manual-line',quantity:1}],refund_amount:999999});
  const r=(await response.json()).request;
  assert.equal(r.refund_amount,474.75);assert.equal(r.requested_amount_paise,47475);
  assert.throws(()=>f.db.prepare('UPDATE return_requests SET refund_amount=949.5 WHERE id=?').run(r.id),/selected purchased/);
  assert.equal((await f.api.updateReturnRequest(change('approved',{refund_amount:949.5}),f.env,owner,r.id)).status,409);
  assert.equal((await f.api.updateReturnRequest(change('approved'),f.env,owner,r.id)).status,200);
});

test('unit allocation is deterministic, discounted and bounded; forged or duplicate lines fail',()=>{
  const lines=[{id:'a',product_id:'p',unit_price:100,quantity:3},{id:'b',product_id:'q',unit_price:199.99,quantity:2}];
  const full=selectReturnLines(lines,lines.map(l=>({line_id:l.id,quantity:l.quantity})),599.97);
  assert.equal(full.reduce((s,l)=>s+l.amount_paise,0),59997);
  for(const selection of [[{line_id:'fake',quantity:1}],[{line_id:'a',quantity:4}],[{line_id:'a',quantity:1},{line_id:'a',quantity:1}]])assert.throws(()=>selectReturnLines(lines,selection,599.97));
});

test('purchased returnability survives catalog changes; restricted new purchases need owner exception',async t=>{
  const f=await fixture(t);
  f.db.prepare('UPDATE products SET returnable=0 WHERE id=?').run(f.productId);
  assert.equal((await f.worker.createReturnRequest(f.request({reason:'Changed mind',refund_destination:'original'}),f.env,customer,'manual-order')).status,201);
  f.db.prepare("DELETE FROM return_requests WHERE order_id='manual-order'").run();
  f.db.prepare("DELETE FROM order_items WHERE id='manual-line'").run();
  f.db.prepare("INSERT INTO order_items(id,order_id,product_id,product_name,unit_price,quantity,size) VALUES('restricted-line','manual-order',?,'Restricted item',949.5,1,'M')").run(f.productId);
  assert.equal((await f.worker.createReturnRequest(f.request({reason:'Damaged item',refund_destination:'original',override_return_policy:true}),f.env,customer,'manual-order')).status,409);
  assert.equal((await f.create({override_return_policy:true,override_reason:'Verified incorrect item sent by Glamia'})).status,201);
});

test('return window uses immutable delivery date, never a later administrative edit',async t=>{
  const f=await fixture(t,{deliveredAt:new Date(Date.now()-20*86400000).toISOString()});
  f.db.prepare("UPDATE orders SET updated_at=CURRENT_TIMESTAMP WHERE id='manual-order'").run();
  assert.equal((await f.create()).status,409);
  assert.throws(()=>f.db.prepare("UPDATE orders SET delivered_at=CURRENT_TIMESTAMP WHERE id='manual-order'").run(),/Delivery date/);
});

test('legacy unknown purchase policy requires an audited owner exception, not the mutable catalog policy',async t=>{
  const f=await fixture(t);
  // Reproduce a row that pre-dates the snapshot migration, only in memory.
  f.db.exec('DROP TRIGGER preserve_return_policy');
  f.db.prepare("UPDATE order_items SET returnable_snapshot=NULL WHERE id='manual-line'").run();
  const options=await (await f.api.customerOrderReturnOptions(f.env,customer,'manual-order')).json();
  assert.equal(options.items[0].returnable,false);
  assert.equal(options.items[0].policy_snapshot_known,false);
  assert.equal((await f.create()).status,409);
  assert.equal((await f.create({override_return_policy:true,override_reason:'Verified the original purchased return policy with customer'})).status,201);
  const audit=JSON.parse(f.db.prepare("SELECT details_json FROM admin_audit_log WHERE action='admin_create_return_request'").get().details_json);
  assert.equal(audit.return_policy_exception,true);
  assert.equal(audit.exception_reason,'Verified the original purchased return policy with customer');
});

test('server options are scoped to purchased line identities and ignore incomplete public catalogs',async t=>{
  const f=await fixture(t);
  const data=await (await f.api.customerOrderReturnOptions(f.env,customer,'manual-order')).json();
  assert.equal(data.items[0].line_id,'manual-line');assert.equal(data.items[0].size,'M');assert.equal(data.items[0].available_sizes[0].size,'L');
  assert.equal((await f.api.customerOrderReturnOptions(f.env,{...customer,email:'other@example.com'},'manual-order')).status,404);
});

test('closed unfunded request can be retried; active request cannot',async t=>{
  const f=await fixture(t),r=(await (await f.create()).json()).request;
  assert.equal((await f.create()).status,409);
  await f.api.updateReturnRequest(change('cancelled'),f.env,owner,r.id);
  assert.equal((await f.api.customerOrderReturnOptions(f.env,customer,'manual-order')).status,200);
  assert.equal((await f.create()).status,201);
});

test('preflight error is a safe customer review state and both presentation models stay identical',()=>{
  const r={type:'refund',status:'received',refund_destination:'original',refund_state:'review_required'};
  assert.equal(refundTracking(r).title,'Refund needs review');
  assert.equal(readFileSync(new URL('../glamia-shoppers-app/src/refundTracking.js',import.meta.url),'utf8').trim(),readFileSync(new URL('../react-app/src/lib/refundTracking.js',import.meta.url),'utf8').trim());
});

test('logistics are audited, labels require private storage and receipt requires verified funds',async t=>{
  const f=await fixture(t),r=(await (await f.create()).json()).request;
  const body={carrier:'Local courier',pickup_status:'scheduled',pickup_at:'2026-10-03T11:30:00+05:30',instructions:'Wait for the booked pickup',inspection_note:'Original packaging checked'};
  await saveReturnLogistics(new Request('http://localhost',{method:'PATCH',body:JSON.stringify(body)}),f.env,r,owner.email);
  const saved=await f.api.getReturnRequest(f.env,r.id);
  assert.equal(JSON.parse(saved.logistics_json).pickup_status,'scheduled');
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action='return_logistics'").get().n,2);
  await assert.rejects(saveReturnLogistics(new Request('http://localhost',{method:'PATCH',body:JSON.stringify({label_base64:btoa('%PDF-test')})}),f.env,saved,owner.email),/private RETURN_DOCUMENTS/);
  await assert.rejects(returnDocument(f.env,saved,'receipt'),/confirmed refund/);
});

test('native document access is owner-only, short-lived, revocable and single-use',async t=>{
  const f=await fixture(t),r=(await (await f.create()).json()).request;
  f.db.prepare("INSERT INTO users(google_sub,email,name) VALUES('document-buyer',?,'Local buyer')").run(customer.email);
  const req=()=>new Request('http://localhost',{method:'POST',body:JSON.stringify({kind:'receipt'})});
  assert.equal((await f.api.createReturnDocumentAccess(req(),f.env,{...customer,email:'other@example.com'},r.id)).status,404);
  const first=await (await f.api.createReturnDocumentAccess(req(),f.env,customer,r.id)).json();
  const token=new URL(first.path,'http://localhost').searchParams.get('access');
  assert.equal(await f.api.consumeReturnDocumentAccess(f.env,r.id,'label',token),false);
  assert.equal(await f.api.consumeReturnDocumentAccess(f.env,r.id,'receipt',token),true);
  assert.equal(await f.api.consumeReturnDocumentAccess(f.env,r.id,'receipt',token),false);
  const second=await (await f.api.createReturnDocumentAccess(req(),f.env,customer,r.id)).json();
  f.db.prepare('UPDATE users SET session_version=session_version+1 WHERE email=?').run(customer.email);
  assert.equal(await f.api.consumeReturnDocumentAccess(f.env,r.id,'receipt',new URL(second.path,'http://localhost').searchParams.get('access')),false);
});

test('return labels stay in private storage, never product storage, and download without caching',async t=>{
  const f=await fixture(t),r=(await (await f.create()).json()).request;
  assert.equal((await f.api.getReturnRequest(f.env,r.id)).label_available,false);
  const objects=new Map();
  f.env.RETURN_DOCUMENTS={put:async(key,bytes)=>objects.set(key,bytes),get:async key=>objects.has(key)?{body:objects.get(key)}:null};
  f.env.PRODUCT_IMAGES={put:()=>{throw Error('Labels must never enter public product storage');}};
  await saveReturnLogistics(new Request('http://localhost',{method:'PATCH',body:JSON.stringify({label_base64:btoa('%PDF-1.7\nlocal-private-label'),instructions:'Use the supplied label'})}),f.env,r,owner.email);
  const saved=await f.api.getReturnRequest(f.env,r.id);
  assert.ok(saved.label_key.startsWith(`private-returns/${r.id}/`));
  assert.equal(saved.label_available,true);
  assert.equal(customerReturnView(saved).label_key,undefined);
  assert.equal(customerReturnView(saved).label_available,true);
  const response=await returnDocument(f.env,saved,'label');
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(response.headers.get('content-type'),'application/pdf');
  assert.equal(await response.text(),'%PDF-1.7\nlocal-private-label');
});
