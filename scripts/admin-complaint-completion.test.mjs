import test from 'node:test';
import assert from 'node:assert/strict';
import { adminReturnsFixture, owner, staff, customer } from './lib/admin-returns-fixture.mjs';
import { workerFunctions } from './lib/worker-fixture.mjs';
import { customerReturnView } from '../src/customer-after-sales.js';
import { refundTracking, returnNeedsUpdates } from '../react-app/src/lib/refundTracking.js';
import { reconcileGatewayRefund } from '../src/gateway-refunds.js';

const reason='Resolved with the customer after checking the provider record.';
async function fixture(t) {
  const f=await adminReturnsFixture();t.after(()=>f.db.close());
  const api=await workerFunctions(['completeReturnComplaint']);
  f.record=(await (await f.create()).json()).request;
  f.close=(actor=owner,body={reason,acknowledge:true},id=f.record.id)=>api.completeReturnComplaint(f.request(body),f.env,actor,id);
  return f;
}
const count=(f,table)=>f.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;

test('only an admin with Returns permission can complete a complaint',async t=>{
  const f=await fixture(t);
  for(const actor of [null,customer,{...staff,employee_permissions:{orders:true}}]) {
    await assert.rejects(f.close(actor),e=>[401,403].includes(e.status));
  }
  const url=new URL('http://localhost/api/admin/returns/local/complete');
  await assert.rejects(f.worker.authorizeEmployeeWebsiteRequest(f.request({}),url,{...staff,employee_permissions:{orders:true}}),e=>e.status===403);
  assert.equal((await f.close(staff)).status,200);
  const log=f.db.prepare("SELECT * FROM admin_audit_log WHERE action='complete_return_complaint'").get();
  assert.equal(log.admin_email,staff.email);
});

test('valid reason and explicit acknowledgement are required, and missing requests return 404',async t=>{
  const f=await fixture(t);
  for(const body of [{reason,acknowledge:false},{reason:'   short ',acknowledge:true},{reason:'x'.repeat(1001),acknowledge:true},{reason:1234567890,acknowledge:true},{reason,acknowledge:'true'}]) assert.equal((await f.close(owner,body)).status,400);
  assert.equal((await f.close(owner,{reason,acknowledge:true},'not-found')).status,404);
  assert.equal((await f.worker.getReturnRequest(f.env,f.record.id)).case_completed_at,null);
});

for(const status of ['requested','approved','received','refunded','completed','rejected','cancelled']) {
  test(`override can close ${status} without replacing the lifecycle state`,async t=>{
    const f=await fixture(t);
    f.db.prepare('UPDATE return_requests SET status=? WHERE id=?').run(status,f.record.id);
    const r=(await (await f.close()).json()).request;
    assert.equal(r.status,status);assert.ok(r.case_completed_at);assert.equal(r.case_completion_reason,reason);
    assert.equal(r.returned_at,null);assert.equal(r.pickup_confirmed_at,null);assert.equal(r.refund_processed_at,null);
    assert.equal(count(f,'gateway_refunds'),0);assert.equal(count(f,'store_credit_ledger'),0);assert.equal(f.networkCalls(),0);
  });
}

test('PhonePe reconciliation, order, ledger, inventory and refund evidence are untouched',async t=>{
  const f=await fixture(t);
  f.db.prepare("UPDATE return_requests SET status='received' WHERE id=?").run(f.record.id);
  f.db.prepare(`INSERT INTO gateway_refunds(id,return_request_id,order_id,provider,provider_order_id,provider_payment_id,total_paise,gateway_paise,order_total_paise,state,approved_by,last_actor,last_error)
    VALUES('local-refund',?,'manual-order','phonepe','provider-order','provider-payment',94950,94950,94950,'reconciliation_required',?,?,'REFUND_TRANSACTION_NOT_FOUND')`).run(f.record.id,owner.email,owner.email);
  const before=f.db.prepare('SELECT * FROM gateway_refunds').get(),order=f.db.prepare("SELECT * FROM orders WHERE id='manual-order'").get();
  const stock=f.db.prepare('SELECT stock FROM products WHERE id=?').get(f.productId),events=count(f,'gateway_refund_events');
  const r=(await (await f.close(owner,{reason,acknowledge:true,status:'refunded',refund_amount:0})).json()).request;
  assert.equal(r.gateway_refund.state,'reconciliation_required');assert.equal(r.status,'received');
  assert.deepEqual(f.db.prepare('SELECT * FROM gateway_refunds').get(),before);
  assert.deepEqual(f.db.prepare("SELECT * FROM orders WHERE id='manual-order'").get(),order);
  assert.deepEqual(f.db.prepare('SELECT stock FROM products WHERE id=?').get(f.productId),stock);
  assert.equal(count(f,'gateway_refund_events'),events);assert.equal(count(f,'store_credit_ledger'),0);
  const publicView=customerReturnView(r);
  assert.ok(publicView.case_completed_at);assert.equal(publicView.case_completed_by,undefined);assert.equal(publicView.case_completion_reason,undefined);
  assert.equal(refundTracking(publicView,order).confirmed,false);assert.equal(returnNeedsUpdates(publicView),true);
  const customerList=(await (await f.worker.listReturns(f.env,customer,'own')).json()).requests;
  assert.equal(customerList[0].case_completed_at,r.case_completed_at);
  assert.equal(customerList[0].case_completion_reason,undefined);assert.equal(customerList[0].case_completed_by,undefined);
  // A later authenticated provider confirmation still settles the original
  // refund once, without losing the administrative closure record.
  const confirmed=await reconcileGatewayRefund(f.env.DB,before,async(provider,path,init={})=>{
    assert.equal(provider,'phonepe');assert.match(path,/\/refund\/local-refund\/status$/);assert.notEqual(init.method,'POST');
    return {originalMerchantOrderId:'provider-order',merchantRefundId:'local-refund',refundId:'provider-confirmed-refund',amount:94950,state:'COMPLETED'};
  },owner.email);
  assert.equal(confirmed.state,'processed');
  const settled=await f.worker.getReturnRequest(f.env,f.record.id);
  assert.equal(settled.status,'refunded');assert.equal(settled.case_completed_at,r.case_completed_at);assert.equal(settled.case_completion_reason,reason);
  assert.equal(refundTracking(customerReturnView(settled),order).confirmed,true);
});

test('concurrent completion is exactly-once and preserves the first actor/reason',async t=>{
  const f=await fixture(t);
  const results=await Promise.all([f.close(owner),f.close(staff,{reason:'Another admin tried to close this same complaint.',acknowledge:true})]);
  const bodies=await Promise.all(results.map(r=>r.json()));
  assert.equal(bodies.filter(r=>!r.idempotent).length,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action='complete_return_complaint'").get().n,1);
  assert.equal(bodies[0].request.case_completed_by,owner.email);assert.equal(bodies[1].request.case_completion_reason,reason);
  assert.equal((await (await f.close()).json()).idempotent,true);
  assert.throws(()=>f.db.prepare('UPDATE return_requests SET case_completion_reason=? WHERE id=?').run('Changed evidence',f.record.id),/evidence cannot be replaced/);
});

test('closure rolls back if its audit write fails',async t=>{
  const f=await fixture(t);
  f.db.exec("CREATE TRIGGER test_audit_failure BEFORE INSERT ON admin_audit_log WHEN NEW.action='complete_return_complaint' BEGIN SELECT RAISE(ABORT,'Audit unavailable'); END");
  await assert.rejects(f.close(),/Audit unavailable/);
  assert.equal((await f.worker.getReturnRequest(f.env,f.record.id)).case_completed_at,null);
});

test('replacement order, reservation and exchange shipping are not changed by complaint closure',async t=>{
  const f=await adminReturnsFixture();t.after(()=>f.db.close());
  const r=(await (await f.create({type:'exchange',exchange_line_id:'manual-line',exchange_product_id:f.productId,exchange_from_size:'M',exchange_to_size:'L'})).json()).request;
  const api=await workerFunctions(['completeReturnComplaint']);
  const before=f.db.prepare('SELECT * FROM orders WHERE id=?').get(r.replacement_order_id);
  const stock=f.db.prepare('SELECT * FROM product_sizes WHERE product_id=? ORDER BY size').all(f.productId);
  const response=await api.completeReturnComplaint(f.request({reason,acknowledge:true}),f.env,staff,r.id);
  assert.equal(response.status,200);assert.deepEqual(f.db.prepare('SELECT * FROM orders WHERE id=?').get(r.replacement_order_id),before);
  assert.deepEqual(f.db.prepare('SELECT * FROM product_sizes WHERE product_id=? ORDER BY size').all(f.productId),stock);
  const after=(await response.json()).request;assert.equal(after.status,'approved');assert.equal(returnNeedsUpdates(after),true);
});
