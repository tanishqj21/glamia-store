import test from 'node:test';
import assert from 'node:assert/strict';
import { adminReturnsFixture, owner, staff, customer } from './lib/admin-returns-fixture.mjs';

async function fixture(t,options) { const f = await adminReturnsFixture(options); t.after(() => f.db.close()); return f; }
test('owner creates a customer-linked, audited request without moving money', async t => {
  const f = await fixture(t);
  const response = await f.create({ status: 'refunded', refund_amount: 999999, customer_email: owner.email });
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(data.request.customer_email, customer.email);
  assert.equal(data.request.status, 'requested');
  assert.equal(data.request.refund_amount, 949.5);
  assert.equal(data.request.gateway_refund, null);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM gateway_refunds').get().n, 0);
  assert.equal(f.networkCalls(), 0);
  const log = f.db.prepare("SELECT * FROM admin_audit_log WHERE action='admin_create_return_request'").get();
  assert.equal(log.admin_email, owner.email);
  assert.equal(JSON.parse(log.details_json).customer_email, customer.email);
  const own = await f.worker.listReturns(f.env, customer, 'own');
  assert.equal((await own.json()).requests[0].id, data.request.id);
  assert.equal((await (await f.worker.listReturns(f.env, { email: 'other@example.com' }, 'own')).json()).requests.length, 0);
});
test('eligible return staff can create but need their granted Returns permission', async t => {
  const f = await fixture(t);
  assert.equal((await f.create({}, staff)).status, 201);
  const denied = { ...staff, employee_permissions: { orders: true } };
  await assert.rejects(f.options(denied), error => error.status === 403);
  await assert.rejects(f.create({}, denied), error => error.status === 403);
  await assert.rejects(f.create({}, customer), error => error.status === 403);
  await assert.rejects(f.create({}, null), error => error.status === 401);
  await assert.rejects(f.worker.authorizeEmployeeWebsiteRequest(f.request({}), new URL(f.path), denied), error => error.status === 403);
});
test('a customer cannot opt into the privileged admin path using body flags', async t => {
  const f = await fixture(t);
  const response = await f.worker.createReturnRequest(f.request({ type: 'refund', reason: 'Customer return', refund_destination: 'original', adminInitiated: true, override_return_window: true }), f.env, { ...customer, email: 'other@example.com' }, 'manual-order');
  assert.equal(response.status, 404);
});
test('options expose only purchased exchange products and valid stock', async t => {
  const f = await fixture(t);
  const options = await (await f.options()).json();
  assert.equal(options.original_refund_available, true);
  assert.equal(options.can_override_return_window, true);
  assert.equal(options.existing_request, null);
  assert.equal(options.exchange_items.length, 1);
  assert.equal(options.exchange_items[0].available_sizes.find(row => row.size === 'L').stock, 6);
  assert.ok(options.exchange_items[0].available_sizes.every(row => row.size !== 'M'));
});
test('owner exception is explicit and logged; customer/staff cannot bypass the window', async t => {
  const f = await fixture(t,{deliveredAt:new Date(Date.now()-20*86400000).toISOString()});
  f.db.prepare("UPDATE orders SET updated_at=datetime('now','-20 days') WHERE id='manual-order'").run();
  assert.equal((await f.create()).status, 409);
  assert.equal((await f.create({ override_return_window: true, override_reason: 'Approved exception for a delayed courier return' }, staff)).status, 403);
  assert.equal((await f.create({ override_return_window: true, override_reason: 'Approved exception' }, { ...staff, is_owner: true })).status, 403);
  assert.equal((await f.create({ override_return_window: true, override_reason: 'short' })).status, 400);
  const customerResponse = await f.worker.createReturnRequest(f.request({ type: 'refund', reason: 'Customer return', override_return_window: true }), f.env, customer, 'manual-order');
  assert.equal(customerResponse.status, 409);
  assert.equal((await f.create({ override_return_window: true, override_reason: 'Approved exception for a delayed courier return' })).status, 201);
  const details = JSON.parse(f.db.prepare("SELECT details_json FROM admin_audit_log WHERE action='admin_create_return_request'").get().details_json);
  assert.equal(details.return_window_exception, true);
  assert.match(details.exception_reason, /delayed courier/);
});
for (const status of ['pending', 'confirmed', 'shipped', 'cancelled']) test(`${status} orders cannot masquerade as received returns`, async t => {
  const f = await fixture(t);
  f.db.prepare('UPDATE orders SET status=? WHERE id=?').run(status, 'manual-order');
  assert.equal((await f.create()).status, 409);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM return_requests').get().n, 0);
});
for (const payment of ['pending', 'failed', 'refunded']) test(`${payment} payments cannot receive another refund or exchange`, async t => {
  const f = await fixture(t);
  f.db.prepare('UPDATE orders SET payment_status=? WHERE id=?').run(payment, 'manual-order');
  assert.equal((await f.create({ refund_destination: 'store_credit' })).status, 409);
  assert.equal((await f.create({ type: 'exchange', exchange_product_id: f.productId, exchange_from_size: 'M', exchange_to_size: 'L' })).status, 409);
});
test('store-credit request retains owner approval and never grants credits immediately', async t => {
  const f = await fixture(t);
  const response = await f.create({ refund_destination: 'store_credit' }, staff);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).request.credit_approval_status, 'pending');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM store_credit_ledger').get().n, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM admin_notifications WHERE owner_only=1").get().n, 1);
});
test('concurrent customer/admin creates produce only one active request', async t => {
  const f = await fixture(t);
  const responses = await Promise.all([f.create(), f.create(), f.worker.createReturnRequest(f.request({ type: 'refund', reason: 'Customer request', refund_destination: 'original' }), f.env, customer, 'manual-order')]);
  assert.equal(responses.filter(response => response.status === 201).length, 1);
  assert.equal(responses.filter(response => response.status === 409).length, 2);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM return_requests').get().n, 1);
});
test('audit failure rolls back admin creation instead of silently omitting its log', async t => {
  const f = await fixture(t);
  f.db.exec("CREATE TRIGGER deny_admin_audit BEFORE INSERT ON admin_audit_log BEGIN SELECT RAISE(ABORT,'Simulated audit failure'); END;");
  await assert.rejects(f.create(), /Simulated audit failure/);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM return_requests').get().n, 0);
});
test('exchange creates a zero-price replacement and reserves the exact purchased quantity once', async t => {
  const f = await fixture(t);
  const before = f.db.prepare('SELECT stock FROM product_sizes WHERE product_id=? AND size=?').get(f.productId, 'L').stock;
  const response = await f.create({ type: 'exchange', exchange_product_id: f.productId, exchange_from_size: 'M', exchange_to_size: 'L' });
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(data.request.type, 'exchange');
  assert.equal(data.request.status,'approved');
  assert.equal(data.replacement_order.total,0);
  assert.equal(data.replacement_order.replacement_fulfilment_mode,'immediate');
  assert.equal(f.db.prepare('SELECT stock FROM product_sizes WHERE product_id=? AND size=?').get(f.productId, 'L').stock, before-1);
  const approved=await (await f.worker.updateReturnRequest(f.request({status:'approved'}),f.env,owner,data.request.id)).json();
  assert.equal(approved.request.replacement_order_id,data.replacement_order.id);
  assert.equal(data.replacement_order.customer_email, customer.email);
  assert.equal(f.db.prepare('SELECT stock FROM product_sizes WHERE product_id=? AND size=?').get(f.productId, 'L').stock, before - 1);
  assert.equal((await f.create({ type: 'exchange', exchange_product_id: f.productId, exchange_from_size: 'M', exchange_to_size: 'L' })).status, 409);
  assert.equal(f.networkCalls(), 0);
});
test('unavailable or unrelated exchange choices cannot create replacements', async t => {
  const f = await fixture(t);
  for (const body of [{ exchange_product_id: 'not-purchased', exchange_from_size: 'M', exchange_to_size: 'L' }, { exchange_product_id: f.productId, exchange_from_size: 'M', exchange_to_size: 'M' }]) assert.equal((await f.create({ type: 'exchange', ...body })).status, 400);
  f.db.prepare("UPDATE product_sizes SET stock=0 WHERE product_id=? AND size!='M'").run(f.productId);
  assert.equal((await f.create({ type: 'exchange', exchange_product_id: f.productId, exchange_from_size: 'M', exchange_to_size: 'L' })).status, 409);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM return_requests').get().n, 0);
});
