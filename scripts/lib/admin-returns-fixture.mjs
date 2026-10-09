import { localDatabase, workerFunctions } from './worker-fixture.mjs';

export const owner = { role: 'admin', is_owner: true, email: 'owner@example.com', name: 'Local owner' };
export const staff = { role: 'admin', is_owner: false, email: 'staff@example.com', employee_id: 'local-staff', employee_permissions: { orders: true, returns: true } };
export const customer = { role: 'seller', email: 'buyer@example.com', name: 'Local buyer' };

export async function adminReturnsFixture({deliveredAt=new Date().toISOString()}={}) {
  const { db, env } = localDatabase();
  Object.assign(env, { ADMIN_EMAILS: [owner.email], DISABLE_OUTBOUND_PUSH: 'true' });
  const productId = 'seed-ivory-linen-shirt';
  db.prepare("UPDATE products SET stock=10,status='live' WHERE id=?").run(productId);
  db.prepare("INSERT OR REPLACE INTO product_sizes(product_id,size,stock) VALUES(?, 'M', 4),(?,'L',6)").run(productId, productId);
  const items = [{ id: productId, product_id: productId, name: 'Ivory linen shirt', size: 'M', quantity: 1 }];
  db.prepare(`INSERT INTO orders(id,order_number,customer_email,customer_name,items_json,subtotal,total,status,payment_method,payment_status,
    payment_gateway,gateway_order_id,gateway_payment_id,payable_total,shipping_json,delivered_at)
    VALUES('manual-order','GM-MANUAL-LOCAL','buyer@example.com','Meera Shah',?,949.5,949.5,'delivered','razorpay','paid','razorpay','order_local','pay_local',949.5,'{}',?)`).run(JSON.stringify(items),deliveredAt);
  db.prepare("INSERT INTO order_items(id,order_id,product_id,product_name,unit_price,quantity,size) VALUES('manual-line','manual-order',?,'Ivory linen shirt',949.5,1,'M')").run(productId);
  let networkCalls = 0;
  const worker = await workerFunctions(['createReturnRequest', 'updateReturnRequest', 'confirmReturnPickup', 'getReturnRequest', 'adminOrderReturnOptions', 'listReturns', 'listOrders', 'authorizeEmployeeWebsiteRequest', 'requireReturnsAdmin'], {
    fetch: () => { networkCalls++; throw Error('No external network permitted in manual-return tests'); },
  });
  const path = 'http://127.0.0.1:5193/api/admin/returns/orders/manual-order';
  const request = body => new Request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const create = (body = {}, actor = owner) => worker.createReturnRequest(request({ type: 'refund', reason: 'Customer contacted Glamia care', refund_destination: 'original', ...body }), env, actor, 'manual-order', { adminInitiated: true });
  const options = (actor = owner) => worker.adminOrderReturnOptions(new Request(path), env, actor, 'manual-order');
  return { db, env, worker, productId, items, path, request, create, options, networkCalls: () => networkCalls };
}
