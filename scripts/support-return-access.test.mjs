import assert from 'node:assert/strict';
import test from 'node:test';
import { adminReturnsFixture, owner, customer, staff } from './lib/admin-returns-fixture.mjs';
import { workerFunctions } from './lib/worker-fixture.mjs';

const care = { ...staff, employee_permissions: { support: true } };
export async function supportAccessFixture(options) {
  const f = await adminReturnsFixture(options);
  f.db.exec('PRAGMA foreign_keys=ON');
  f.db.prepare("DELETE FROM order_items WHERE id='manual-line'").run();
  f.db.prepare('UPDATE products SET returnable=0 WHERE id=?').run(f.productId);
  f.db.prepare("INSERT INTO order_items(id,order_id,product_id,product_name,unit_price,quantity,size) VALUES('manual-line','manual-order',?,'Ivory linen shirt',949.5,1,'M')").run(f.productId);
  const worker = await workerFunctions(['createSupportTicket','supportTicketOrderContext','updateSupportReturnAccess','customerOrderReturnOptions','supportOrderContextData','createReturnRequest']);
  const create = async (body = {}) => worker.createSupportTicket(f.request({ subject: 'Return help', message: 'This purchased product arrived damaged.', order_id: 'manual-order', item_line_ids: ['manual-line'], ...body }), f.env, customer);
  const { ticket } = await (await create()).json();
  const grant = (enabled = true, body = {}, actor = care) => worker.updateSupportReturnAccess(f.request({ enabled, line_ids: ['manual-line'], reason: 'Damaged item verified manually in chat.', ...body }), f.env, actor, ticket.id);
  const context = (actor = care) => worker.supportTicketOrderContext(f.env, actor, ticket.id);
  const returnOptions = () => worker.customerOrderReturnOptions(f.env, customer, 'manual-order');
  const submit = (body = {}) => worker.createReturnRequest(f.request({ type: 'return_refund', reason: 'Item arrived damaged', refund_destination: 'original', items: [{ line_id: 'manual-line', quantity: 1 }], ...body }), f.env, customer, 'manual-order');
  return { ...f, accessWorker: worker, ticket, create, grant, context, returnOptions, submit };
}

test('support sees exact customer-selected purchased product and immutable non-returnable policy', async () => {
  const f = await supportAccessFixture();
  try {
    const context = await (await f.context()).json();
    assert.equal(context.order.order_number, 'GM-MANUAL-LOCAL');
    assert.equal(context.items[0].referenced, true);
    assert.equal(context.items[0].standard_returnable, false);
    assert.equal(context.items[0].can_enable, true);
    assert.deepEqual(f.ticket.referenced_line_ids, ['manual-line']);
    assert.equal((await f.create({ item_line_ids: ['someone-elses-line'] })).status, 400);
    assert.equal((await f.create({ item_line_ids: [123] })).status, 400);
    assert.equal((await f.create({ item_line_ids: null })).status, 400);
  } finally { f.db.close(); }
});

test('manual grant enables normal customer submission without changing catalogue, snapshot or sending chat/refund', async () => {
  const f = await supportAccessFixture();
  try {
    assert.equal((await (await f.returnOptions()).json()).eligible, false);
    assert.equal((await f.submit({ override_return_policy: true, support_return_enabled: true })).status, 409);
    const beforeStock = f.db.prepare('SELECT stock FROM products WHERE id=?').get(f.productId).stock;
    const beforeMessages = f.db.prepare('SELECT COUNT(*) AS n FROM support_messages').get().n;
    assert.equal((await f.grant()).status, 200);
    const options = await (await f.returnOptions()).json();
    assert.equal(options.eligible, true);
    assert.equal(options.items[0].support_return_enabled, true);
    assert.equal(options.items[0].standard_returnable, false);
    assert.equal(f.db.prepare("SELECT returnable_snapshot FROM order_items WHERE id='manual-line'").get().returnable_snapshot, 0);
    assert.equal(f.db.prepare('SELECT returnable FROM products WHERE id=?').get(f.productId).returnable, 0);
    assert.equal(f.db.prepare('SELECT stock FROM products WHERE id=?').get(f.productId).stock, beforeStock);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM support_messages').get().n, beforeMessages);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM gateway_refunds').get().n, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM return_requests').get().n, 0);
    assert.equal((await f.submit()).status, 201);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM gateway_refunds').get().n, 0);
    assert.equal(f.networkCalls(), 0);
  } finally { f.db.close(); }
});

test('support permission is required; returns/inventory/customer access cannot grant or read staff context', async () => {
  const f = await supportAccessFixture();
  try {
    for (const actor of [customer, staff, { ...care, employee_permissions: { inventory: true } }]) {
      await assert.rejects(f.grant(true, {}, actor), error => error.status === 403);
      await assert.rejects(f.context(actor), error => error.status === 403);
    }
    assert.equal((await f.grant(true, {}, owner)).status, 200);
    assert.equal((await f.grant(true, { enabled: 'true' })).status, 400);
    assert.equal((await f.grant(true, { reason: 'short' })).status, 400);
    assert.equal((await f.grant(true, { line_ids: [] })).status, 400);
  } finally { f.db.close(); }
});

test('audit is durable, repeat requests are idempotent and disabling restores normal policy', async () => {
  const f = await supportAccessFixture();
  try {
    await f.grant(); await f.grant();
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM order_return_access_events').get().n, 1);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE action='support_return_access'").get().n, 1);
    await f.grant(false);
    assert.equal((await (await f.returnOptions()).json()).eligible, false);
    assert.equal((await f.submit()).status, 409);
    const events = (await (await f.context()).json()).access_history;
    assert.equal(events.length, 2); assert.equal(events[0].actor, care.email); assert.equal(events[0].enabled, 0);
    assert.throws(() => f.db.exec('DELETE FROM order_return_access'), /Disable return access/);
    assert.throws(() => f.db.exec('UPDATE order_return_access_events SET enabled=0'), /immutable/);
    assert.equal(f.db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally { f.db.close(); }
});

test('enabling return access cannot extend the delivery window or bypass payment and delivery guards', async () => {
  for (const kind of ['expired','undelivered','unpaid']) {
    const f = await supportAccessFixture(kind === 'expired' ? { deliveredAt: new Date(Date.now()-9*86400000).toISOString() } : undefined);
    try {
      if (kind === 'undelivered') f.db.exec("UPDATE orders SET status='shipped' WHERE id='manual-order'");
      if (kind === 'unpaid') f.db.exec("UPDATE orders SET payment_status='pending' WHERE id='manual-order'");
      assert.equal((await f.grant()).status, 409, kind);
      assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM order_return_access').get().n, 0);
    } finally { f.db.close(); }
  }
});

test('an active return freezes policy access and rejects duplicate customer returns', async () => {
  const f = await supportAccessFixture();
  try {
    await f.grant(); await f.submit();
    assert.equal((await f.grant(false)).status, 409);
    assert.equal((await f.submit()).status, 409);
    assert.throws(() => f.db.exec("UPDATE order_return_access SET enabled=0 WHERE order_item_id='manual-line'"), /already uses/);
    assert.equal(f.db.prepare('SELECT enabled FROM order_return_access').get().enabled, 1);
  } finally { f.db.close(); }
});

test('linked-order verification fails closed and grants cannot move between orders', async () => {
  const f = await supportAccessFixture();
  try {
    assert.equal((await f.grant(true, { line_ids: ['different-order-line'] })).status, 400);
    f.db.prepare('UPDATE support_tickets SET customer_email=? WHERE id=?').run('other@example.com', f.ticket.id);
    assert.equal((await (await f.context()).json()).order, null);
    assert.equal((await f.grant()).status, 409);
    assert.throws(() => f.db.prepare('INSERT INTO order_return_access(order_item_id,order_id,ticket_id,enabled,actor,reason) VALUES(?,?,?,?,?,?)').run('manual-line','manual-order',f.ticket.id,1,care.email,'Wrong customer must not grant.'), /support order/);
  } finally { f.db.close(); }
});

test('customer context contains policy flags but never internal reasons, staff identities or gateway IDs', async () => {
  const f = await supportAccessFixture();
  try {
    await f.grant();
    const order = f.db.prepare("SELECT * FROM orders WHERE id='manual-order'").get();
    const context = await f.accessWorker.supportOrderContextData(f.env, order);
    const text = JSON.stringify(context);
    for (const secret of [care.email, 'Damaged item verified manually', 'order_local', 'pay_local', 'access_history', 'admin_note']) assert.equal(text.includes(secret), false, secret);
    assert.equal(context.items[0].support_return_enabled, true);
    assert.equal(context.items[0].can_enable, false);
  } finally { f.db.close(); }
});

test('revocation between return preflight and commit is checked inside the atomic claim', async () => {
  const f = await supportAccessFixture();
  try {
    await f.grant();
    const originalBatch = f.env.DB.batch.bind(f.env.DB);
    f.env.DB.batch = statements => {
      f.db.exec("UPDATE order_return_access SET enabled=0 WHERE order_item_id='manual-line'");
      return originalBatch(statements);
    };
    assert.equal((await f.submit()).status, 409);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM return_requests').get().n, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM gateway_refunds').get().n, 0);
  } finally { f.db.close(); }
});

test('an exception is scoped to the selected line and order, including other purchases of the same product', async () => {
  const f = await supportAccessFixture();
  try {
    f.db.prepare("INSERT INTO order_items(id,order_id,product_id,product_name,unit_price,quantity,size) VALUES('second-line','manual-order',?,'Same shirt, size L',949.5,1,'L')").run(f.productId);
    f.db.exec("INSERT INTO orders(id,order_number,customer_email,customer_name,items_json,subtotal,total,status,payment_method,payment_status,delivered_at) SELECT 'other-order','GM-OTHER',customer_email,customer_name,items_json,subtotal,total,status,payment_method,payment_status,delivered_at FROM orders WHERE id='manual-order'");
    f.db.prepare("INSERT INTO order_items(id,order_id,product_id,product_name,unit_price,quantity,size) VALUES('other-line','other-order',?,'Same shirt, different order',949.5,1,'M')").run(f.productId);
    await f.grant();
    const options = await (await f.returnOptions()).json();
    assert.equal(options.items.find(line => line.line_id === 'second-line').returnable, false);
    const other = await (await f.accessWorker.customerOrderReturnOptions(f.env,customer,'other-order')).json();
    assert.equal(other.eligible,false);
    assert.equal((await f.submit({items:[{line_id:'second-line',quantity:1}]})).status,409);
    assert.equal((await f.submit({items:[{line_id:'other-line',quantity:1}]})).status,400);
    assert.equal((await f.submit({items:[{line_id:'manual-line',quantity:2}]})).status,400);
  } finally {f.db.close();}
});

test('a return created during grant editing blocks the grant transaction and its audit', async () => {
  const f = await supportAccessFixture();
  try {
    const batch = f.env.DB.batch.bind(f.env.DB);
    f.env.DB.batch = statements => {
      f.db.prepare("INSERT INTO return_requests(id,order_id,customer_email,type,reason,refund_amount,selected_items_json,requested_amount_paise) VALUES('raced-return','manual-order',?,'refund','Concurrent authorised return',949.5,?,94950)").run(customer.email,JSON.stringify([{line_id:'manual-line',product_id:f.productId,quantity:1,amount_paise:94950}]));
      return batch(statements);
    };
    assert.equal((await f.grant()).status,409);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM order_return_access').get().n,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM order_return_access_events').get().n,0);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM admin_audit_log WHERE action='support_return_access'").get().n,0);
  } finally {f.db.close();}
});

test('product context prefers purchase-time images and colours over an edited catalogue', async () => {
  const f = await supportAccessFixture();
  try {
    f.db.prepare("UPDATE orders SET items_json=? WHERE id='manual-order'").run(JSON.stringify([{id:f.productId,name:'Ivory linen shirt',size:'M',quantity:1,color:'Purchased ivory',image:'/purchase-image.png'}]));
    f.db.prepare("UPDATE products SET color='New colour',image_url='/new-image.png' WHERE id=?").run(f.productId);
    const context = await (await f.context()).json();
    assert.equal(context.items[0].color,'Purchased ivory');
    assert.equal(context.items[0].image_url,'/purchase-image.png');
    const options = await (await f.returnOptions()).json();
    assert.equal(options.items[0].color,'Purchased ivory');
    assert.equal(options.items[0].image_url,'/purchase-image.png');
  } finally {f.db.close();}
});
