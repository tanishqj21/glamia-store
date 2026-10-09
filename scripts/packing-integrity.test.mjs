import test from 'node:test';
import assert from 'node:assert/strict';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

function fixture(t) {
  const { db, env } = localDatabase();
  t.after(() => db.close());
  const add = (id, payment, status = 'confirmed') => db.prepare(`INSERT INTO orders
    (id, order_number, customer_email, items_json, subtotal, total, status, payment_method, payment_status, shipping_json)
    VALUES (?, ?, 'packing@example.com', '[]', 100, 100, ?, 'razorpay', ?, '{}')`).run(id, id, status, payment);
  add('paid', 'paid'); add('free', 'not_required');
  for (const state of ['pending', 'authorized', 'failed', 'refunded']) add(state, state);
  add('cancelled', 'paid', 'cancelled');
  return { db, env, employee: { employee: { id: 'local-packer', name: 'Local packer' } } };
}

test('packing queue and workload counts exclude unpaid, refunded and cancelled orders', async t => {
  const { env } = fixture(t);
  const worker = await workerFunctions(['listEmployeeOrders', 'employeeDashboard', 'getEmployeeOrder']);
  for (const scope of ['unpacked', 'all']) {
    const data = await (await worker.listEmployeeOrders(env, scope)).json();
    assert.deepEqual(data.orders.map(order => order.id).sort(), ['free', 'paid']);
  }
  const dashboard = await (await worker.employeeDashboard(env)).json();
  assert.equal(dashboard.stats.unpacked_orders, 2);
  for (const id of ['pending', 'authorized', 'failed', 'refunded', 'cancelled']) {
    const response = await worker.getEmployeeOrder(env, id);
    assert.ok([404, 409].includes(response.status));
  }
});

test('packing cannot bypass payment eligibility, including already-packed records', async t => {
  const { db, env, employee } = fixture(t);
  const worker = await workerFunctions(['markEmployeeOrderPacked']);
  for (const id of ['pending', 'authorized', 'failed', 'refunded', 'cancelled']) {
    assert.equal((await worker.markEmployeeOrderPacked(env, id, employee)).status, 409);
    assert.equal(db.prepare('SELECT packing_status FROM orders WHERE id=?').get(id).packing_status, 'unpacked');
  }
  db.prepare("UPDATE orders SET packing_status='packed' WHERE id='refunded'").run();
  assert.equal((await worker.markEmployeeOrderPacked(env, 'refunded', employee)).status, 409);
  for (const id of ['paid', 'free']) {
    assert.equal((await worker.markEmployeeOrderPacked(env, id, employee)).status, 200);
    const repeated = await (await worker.markEmployeeOrderPacked(env, id, employee)).json();
    assert.equal(repeated.already_packed, true);
  }
});

test('payment refund between read and packing write is rejected by the SQL guard', async t => {
  const { db, env, employee } = fixture(t);
  const prepare = env.DB.prepare;
  env.DB.prepare = sql => {
    if (/UPDATE orders\s+SET packing_status/.test(sql)) db.prepare("UPDATE orders SET payment_status='refunded' WHERE id='paid'").run();
    return prepare(sql);
  };
  const worker = await workerFunctions(['markEmployeeOrderPacked']);
  assert.equal((await worker.markEmployeeOrderPacked(env, 'paid', employee)).status, 409);
  assert.equal(db.prepare("SELECT packing_status FROM orders WHERE id='paid'").get().packing_status, 'unpacked');
});
