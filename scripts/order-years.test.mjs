import test from 'node:test';
import assert from 'node:assert/strict';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';
import { orderCalendarYear, groupOrdersByYear } from '../react-app/src/lib/orderYears.js';

const worker = await workerFunctions(['listOrders']);
const owner = { role: 'admin', is_owner: true, email: 'owner@example.com' };
function fixture(t) {
  const f = localDatabase(); t.after(() => f.db.close());
  const dates = ['2024-06-01 12:00:00', '2025-06-01 12:00:00', '2025-12-31 18:29:59', '2025-12-31T18:30:00Z', '2026-06-01 12:00:00'];
  for (const [index, date] of dates.entries()) {
    f.db.prepare(`INSERT INTO orders(id,order_number,customer_email,customer_name,items_json,subtotal,total,status,payment_method,payment_status,created_at)
      VALUES(?,?,?,'Year fixture','[]',100,100,'delivered','razorpay','paid',?)`).run(`year-${index}`, `${index % 2 ? 'WB' : 'GM'}-YEAR-${index}`, 'year@example.com', date);
  }
  f.list = params => worker.listOrders(f.env, owner, 'admin', new URLSearchParams(params));
  return f;
}

test('admin years cover both brands and filter the complete dataset before pagination', async t => {
  const f = fixture(t);
  const first = await (await f.list({ year: '2025', limit: '1' })).json();
  assert.deepEqual(first.years, [{ year: '2026', count: 2 }, { year: '2025', count: 2 }, { year: '2024', count: 1 }]);
  assert.equal(first.pagination.total, 2); assert.equal(first.pagination.has_more, true);
  assert.deepEqual(first.orders.map(o => o.id), ['year-2']);
  const second = await (await f.list({ year: '2025', limit: '1', page: '2' })).json();
  assert.deepEqual(second.orders.map(o => o.id), ['year-1']);
  assert.equal(second.pagination.has_more, false);
  assert.match(second.orders[0].order_number, /^WB-/);
  const all = await (await f.list({ limit: '50' })).json();
  assert.equal(all.pagination.total, 5); assert.equal(all.selected_year, 'all');
});

test('completed purchases use their order year even if the bill is issued in a later year', async t => {
  const f = fixture(t);
  const bill = f.db.prepare("SELECT * FROM order_bills WHERE order_id='year-1'").get();
  f.db.prepare("DELETE FROM order_bills WHERE order_id='year-1'").run();
  f.db.prepare("INSERT INTO order_bills(order_id,bill_number,snapshot_json,seller_json,issued_at) VALUES('year-1',?,?,?,'2027-01-01 00:00:00')").run(bill.bill_number, bill.snapshot_json, bill.seller_json);
  const data = await (await f.list({ year: '2025', completed: '1', q: 'WB-YEAR', limit: '30' })).json();
  assert.deepEqual(data.orders.map(o => o.id), ['year-1']);
  assert.equal(data.pagination.total, 1);
  assert.equal(data.years.length, 3);
});

test('year validation and admin authorisation apply before filtering', async t => {
  const f = fixture(t);
  for (const year of ['2025 OR 1=1', '25', '1899', '-2025']) assert.equal((await f.list({ year })).status, 400);
  await assert.rejects(worker.listOrders(f.env, { role: 'seller', email: 'year@example.com' }, 'admin', new URLSearchParams({ year: '2025' })), /Admin|Forbidden|permission/i);
});

test('empty history returns an empty year list without an invalid pagination count', async t => {
  const f = fixture(t); f.db.prepare('DELETE FROM orders').run();
  const data = await (await f.list({ year: '2026', limit: '50' })).json();
  assert.deepEqual(data.orders, []); assert.deepEqual(data.years, []);
  assert.equal(data.pagination.total, 0); assert.equal(data.pagination.pages, 1);
});

test('display headings match the India year boundary and retain records within each year', () => {
  assert.equal(orderCalendarYear('2025-12-31 18:29:59'), '2025');
  assert.equal(orderCalendarYear('2025-12-31T18:30:00Z'), '2026');
  assert.equal(orderCalendarYear('2026-01-01T00:00:00+05:30'), '2026');
  const records = [{ id: 'older', created_at: '2024-01-01 00:00:00' }, { id: 'newer', created_at: '2026-01-01 00:00:00' }];
  assert.deepEqual(groupOrdersByYear(records).map(group => [group.year, group.orders[0].id]), [['2026', 'newer'], ['2024', 'older']]);
});
