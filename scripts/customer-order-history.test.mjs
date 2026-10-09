import test from "node:test";
import assert from "node:assert/strict";
import { localDatabase, workerFunctions } from "./lib/worker-fixture.mjs";

const owner = { role: "admin", is_owner: true, email: "owner@example.com" };
function fixture() {
  const { db, env } = localDatabase();
  for (const email of ["history@example.com", "other-history@example.com", "empty-history@example.com"]) {
    db.prepare("INSERT INTO users(email,google_sub,name) VALUES (?,?,?)").run(email, `fixture-${email}`, "History fixture");
  }
  const insert = (id, email, name = "Night suit", status = "delivered", created = "2026-10-01 12:00:00") => {
    db.prepare(`INSERT INTO orders(id,order_number,customer_email,items_json,subtotal,total,status,payment_method,payment_status,packing_status,created_at,tracking_token,shipping_json)
      VALUES (?,?,?,?,100,100,?,'razorpay','paid','packed',?,?,'{"phone":"private-phone"}')`)
      .run(id, `GM-${id}`, email, JSON.stringify([{ name, quantity: 2, size: "M", color: "Teal" }]), status, created, `private-token-${id}`);
  };
  return { db, env, insert };
}

test("history is scoped to one customer, newest first, including cancellations without packing", async t => {
  const { db, env, insert } = fixture(); t.after(() => db.close());
  insert("older", "history@example.com", "Night suit", "delivered", "2026-09-01 00:00:00");
  insert("newer", "history@example.com", "Night suit", "cancelled");
  insert("other", "other-history@example.com");
  const { listAdminCustomerOrders } = await workerFunctions(["listAdminCustomerOrders"]);
  const response = await listAdminCustomerOrders(env, owner, "HISTORY@example.com");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const result = await response.json();
  assert.equal(result.customer.email, "history@example.com");
  assert.deepEqual(result.orders.map(order => order.id), ["newer", "older"]);
  assert.equal(result.pagination.total, 2);
  assert.equal(result.orders[0].packing_status, "not_required");
  assert.equal(result.orders[1].items[0].name, "Night suit");
  for (const order of result.orders) for (const privateKey of ["tracking_token", "shipping", "shipping_json", "payment_reference", "customer_email"]) assert.equal(privateKey in order, false);
});

test("history supports product and order-number searches with literal wildcard escaping and bound SQL", async t => {
  const { db, env, insert } = fixture(); t.after(() => db.close());
  insert("ONE", "history@example.com", "100% cotton_A");
  insert("TWO", "history@example.com", "Night suit");
  insert("OTHER", "other-history@example.com", "100% cotton_A");
  const { listAdminCustomerOrders } = await workerFunctions(["listAdminCustomerOrders"]);
  for (const [q, ids] of [["night", ["TWO"]], ["GM-ONE", ["ONE"]], ["%", ["ONE"]], ["_", ["ONE"]], ["' OR 1=1 --", []]]) {
    const result = await (await listAdminCustomerOrders(env, owner, "history@example.com", new URLSearchParams({ q }))).json();
    assert.deepEqual(result.orders.map(order => order.id), ids);
    assert.equal(result.pagination.total, ids.length);
  }
});

test("history pagination is bounded, counts match, and empty or malformed old records remain usable", async t => {
  const { db, env, insert } = fixture(); t.after(() => db.close());
  for (let index = 0; index < 28; index++) insert(`order-${String(index).padStart(2, "0")}`, "history@example.com");
  const { listAdminCustomerOrders } = await workerFunctions(["listAdminCustomerOrders"]);
  const first = await (await listAdminCustomerOrders(env, owner, "history@example.com")).json();
  const second = await (await listAdminCustomerOrders(env, owner, "history@example.com", new URLSearchParams({ page: "2" }))).json();
  assert.equal(first.orders.length, 25); assert.equal(first.pagination.has_more, true);
  assert.equal(second.orders.length, 3); assert.equal(second.pagination.has_more, false);
  assert.equal(new Set([...first.orders, ...second.orders].map(order => order.id)).size, 28);
  assert.equal((await (await listAdminCustomerOrders(env, owner, "history@example.com", new URLSearchParams({ limit: "10000" }))).json()).pagination.limit, 50);
  const empty = await (await listAdminCustomerOrders(env, owner, "empty-history@example.com")).json();
  assert.equal(empty.pagination.total, 0); assert.deepEqual(empty.orders, []);
  db.prepare("UPDATE orders SET items_json='{}' WHERE id='order-27'").run();
  assert.deepEqual((await (await listAdminCustomerOrders(env, owner, "history@example.com")).json()).orders[0].items, []);
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT id FROM orders WHERE customer_email = ?").all("history@example.com");
  assert.ok(plan.some(row => row.detail.includes("idx_orders_customer")));
});

test("anonymous, shopper, and staff without both capabilities cannot read customer history", async t => {
  const { db, env } = fixture(); t.after(() => db.close());
  const { listAdminCustomerOrders } = await workerFunctions(["listAdminCustomerOrders"]);
  await assert.rejects(listAdminCustomerOrders(env, null, "history@example.com"), { status: 401 });
  await assert.rejects(listAdminCustomerOrders(env, { role: "seller" }, "history@example.com"), { status: 403 });
  for (const employee_permissions of [{}, { customers: true }, { orders: true }]) {
    await assert.rejects(listAdminCustomerOrders(env, { role: "admin", employee_id: "staff", employee_permissions }, "history@example.com"), { status: 403 });
  }
  const result = await listAdminCustomerOrders(env, { role: "admin", employee_id: "staff", employee_permissions: { customers: true, orders: true } }, "history@example.com");
  assert.equal(result.status, 200);
});

test("unknown customers, invalid email, and invalid page inputs fail safely", async t => {
  const { db, env } = fixture(); t.after(() => db.close());
  const { listAdminCustomerOrders } = await workerFunctions(["listAdminCustomerOrders"]);
  await assert.rejects(listAdminCustomerOrders(env, owner, "unknown@example.com"), { status: 404 });
  await assert.rejects(listAdminCustomerOrders(env, owner, "not-email"), { status: 400 });
  for (const params of [{ page: "-1" }, { page: "Infinity" }, { page: "100001" }, { page: "1.5" }, { limit: "-4" }]) {
    await assert.rejects(listAdminCustomerOrders(env, owner, "history@example.com", new URLSearchParams(params)), { status: 400 });
  }
});
