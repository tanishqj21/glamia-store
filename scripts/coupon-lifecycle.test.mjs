// Entirely isolated SQLite fixtures: no live users, payments, coupons or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localDatabase, workerFunctions } from './lib/worker-fixture.mjs';

const worker = await workerFunctions(['validateCoupon', 'listAvailableCoupons', 'listCoupons',
  'createCoupon', 'updateCoupon', 'deleteCoupon', 'createOrder', 'isWhitelistedCouponAdmin']);
const owner = { email: 'owner@example.com', name: 'Owner', role: 'admin' };
const buyer = { email: 'buyer@example.com', name: 'Buyer', role: 'seller' };
const items = [{ id: 'coupon-fixture-product', quantity: 1 }];
const request = body => new Request('http://localhost/api/coupons', { method: 'POST', body: JSON.stringify(body) });
function fixture(t, options) {
  const local = localDatabase({ foreignKeys: true, ...options }); t.after(() => local.db.close());
  local.env.ADMIN_EMAILS = ['owner@example.com'];
  local.db.exec(`INSERT INTO products(id,seller_email,name,category,brand,price,mrp,stock,color,sizes_json,image_url,description,status)
    VALUES('coupon-fixture-product','seller@example.com','Coupon Fixture','Women','Glamia',100,100,50,'Green','[]','/fixture.png','Local only','live')`);
  for (const user of [owner, buyer]) {
    local.db.prepare('INSERT INTO users(email,google_sub,name) VALUES(?,?,?)').run(user.email, user.email, user.name);
    local.db.prepare("INSERT INTO store_credit_ledger(id,user_email,amount,kind,description,idempotency_key) VALUES(?,?,1000,'opening','Local fixture',?)")
      .run(user.email, user.email, user.email);
  }
  return local;
}
async function coupon(env, extra = {}) {
  const response = await worker.createCoupon(request({ code: 'TEST', type: 'flat', value: 10,
    per_user_limit: 1, usage_limit: 1, allow_store_credits: true, ...extra }), env);
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()).coupon;
}
async function validate(env, user, code = 'TEST', extra = {}) {
  const response = await worker.validateCoupon(request({ code, items, ...extra }), env, user);
  return { status: response.status, ...(await response.json()) };
}
async function purchase(env, user, token, extra = {}) {
  const body = { items, coupon: 'TEST', payment_method: 'store_credit', credits_used: 90,
    checkout_token: `coupon-fixture-token-${token}`,
    address: { name: 'Local Buyer', phone: '+919876543210', line1: '123 Test Road',
      city: 'New Delhi', state: 'Delhi', pin: '110001', country: 'India' }, ...extra };
  return worker.createOrder(request(body), env, user);
}

test('whitelisted admins bypass employee, timing, audience, cart, scope, cap and credit restrictions', async t => {
  const { db, env } = fixture(t);
  await coupon(env, { active: false, employee_only: true, allow_store_credits: false,
    starts_at: '2090-01-01', ends_at: '2091-01-01', min_cart_value: 10000, max_discount: 1,
    scope: 'product', scope_value: 'seed-midnight-satin-dress' });
  let result = await validate(env, owner);
  assert.equal(result.status, 200); assert.equal(result.discount, 10);
  assert.equal(result.admin_exempt, true); assert.equal(result.allow_store_credits, true);
  assert.equal(result.per_user_limit, null); assert.equal(result.scope, 'all');
  assert.equal((await validate(env, buyer)).status, 400);
  db.exec("UPDATE coupons SET active=1,employee_only=0,starts_at=NULL,ends_at='2000-01-01'; INSERT INTO coupon_email_targets(coupon_code,email) VALUES('TEST','someone@example.com')");
  result = await validate(env, owner);
  assert.equal(result.status, 200); assert.equal(result.discount, 10);
  const offers = await worker.listAvailableCoupons(request({ items }), env, owner);
  assert.equal((await offers.json()).coupons[0].admin_exempt, true);
  assert.equal((await purchase(env, owner, 'restricted')).status, 201);
});

test('only authenticated server-whitelisted email grants exemption, not an admin role or request flags', async t => {
  const { env } = fixture(t); await coupon(env, { employee_only: true });
  assert.equal(worker.isWhitelistedCouponAdmin(env, { email: ' OWNER@EXAMPLE.COM ' }), true);
  assert.equal(worker.isWhitelistedCouponAdmin(env, { ...buyer, role: 'admin' }), false);
  assert.equal(worker.isWhitelistedCouponAdmin(env, null), false);
  const result = await validate(env, { ...buyer, role: 'admin' }, 'TEST', {
    email: owner.email, admin_exempt: true, coupon_admin_exempt: 1 });
  assert.equal(result.status, 400); assert.match(result.error, /employees/);
  await assert.rejects(purchase(env, { ...buyer, role: 'admin' }, 'spoof', {
    email: owner.email, admin_exempt: true, coupon_admin_exempt: 1 }), /employees/);
  await assert.rejects(purchase(env, null, 'guest', { email: owner.email }), /Sign in to use a coupon/);
});

test('unlimited admin redemptions remain logged without spending normal customer allowances', async t => {
  const { db, env } = fixture(t); const created = await coupon(env);
  for (let i = 0; i < 3; i++) assert.equal((await purchase(env, owner, `owner-${i}`)).status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM coupon_redemptions WHERE admin_exempt=1').get().n, 3);
  assert.equal((await validate(env, buyer)).status, 200);
  assert.equal((await purchase(env, buyer, 'buyer-first')).status, 201);
  assert.equal((await validate(env, buyer)).status, 400);
  assert.equal((await purchase(env, owner, 'owner-after-exhausted')).status, 201);
  const listing = (await (await worker.listCoupons(env)).json()).coupons.find(row => row.code === 'TEST');
  assert.equal(listing.usage_count, 1); assert.equal(listing.admin_usage_count, 4);
  assert.equal(listing.instance_id, created.instance_id);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders WHERE coupon_admin_exempt=1 AND coupon_instance_id=?").get(created.instance_id).n, 4);
});

test('deleting and recreating the same code resets allowances while preserving old purchases and redemptions', async t => {
  const { db, env } = fixture(t); const first = await coupon(env);
  assert.equal((await purchase(env, buyer, 'old-generation')).status, 201);
  assert.equal((await validate(env, buyer)).status, 400);
  await worker.deleteCoupon(env, ' test ');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM coupon_redemptions').get().n, 1);
  assert.equal((await validate(env, owner)).status, 400); // Deleted codes never apply.
  const second = await coupon(env); assert.notEqual(second.instance_id, first.instance_id);
  const listing = (await (await worker.listCoupons(env)).json()).coupons[0];
  assert.equal(listing.usage_count, 0);
  assert.equal((await purchase(env, buyer, 'new-generation')).status, 201);
  await assert.rejects(purchase(env, buyer, 'new-generation-second'), /usage limit/);
  const history = db.prepare('SELECT coupon_instance_id FROM coupon_redemptions ORDER BY rowid').all();
  assert.deepEqual(history.map(row => row.coupon_instance_id), [first.instance_id, second.instance_id]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 2);
});

test('editing a coupon keeps its identity and used allowances', async t => {
  const { db, env } = fixture(t); const created = await coupon(env);
  await purchase(env, buyer, 'before-edit');
  const response = await worker.updateCoupon(request({ value: 20 }), env, 'TEST');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).coupon.instance_id, created.instance_id);
  assert.equal((await validate(env, buyer)).status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM coupon_redemptions').get().n, 1);
});

test('per-account allowance is generation-specific even without a global limit', async t => {
  const { env } = fixture(t); await coupon(env, { usage_limit: null });
  await purchase(env, buyer, 'personal-old');
  const result = await validate(env, { ...buyer, email: ' BUYER@EXAMPLE.COM ' });
  assert.equal(result.status, 400); assert.match(result.error, /maximum number/);
  await worker.deleteCoupon(env, 'TEST'); await coupon(env, { usage_limit: null });
  assert.equal((await purchase(env, buyer, 'personal-new')).status, 201);
  assert.equal((await validate(env, buyer)).status, 400);
});

test('duplicate creation does not replace an existing coupon or reset its identity', async t => {
  const { db, env } = fixture(t); const first = await coupon(env);
  await assert.rejects(worker.createCoupon(request({ code: 'TEST', type: 'flat', value: 30 }), env), /already exists/);
  const saved = db.prepare("SELECT * FROM coupons WHERE code='TEST'").get();
  assert.equal(saved.instance_id, first.instance_id); assert.equal(saved.value, 10);
});

test('concurrent checkout enforces ordinary coupon quota atomically without stock or wallet leakage', async t => {
  const { db, env } = fixture(t); await coupon(env);
  const attempts = await Promise.allSettled([purchase(env, buyer, 'race-one'), purchase(env, buyer, 'race-two')]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = attempts.find(result => result.status === 'rejected');
  assert.match(rejected.reason.message, /usage limit/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get(items[0].id).stock, 49);
  assert.equal(db.prepare('SELECT balance FROM store_credit_accounts WHERE user_email=?').get(buyer.email).balance, 910);
});

test('delete/recreate during checkout rejects stale coupon identity and rolls back the entire purchase', async t => {
  const { db, env } = fixture(t); const first = await coupon(env);
  const batch = env.DB.batch; let changed = false;
  env.DB.batch = statements => {
    if (!changed) {
      changed = true;
      db.exec("DELETE FROM coupons WHERE code='TEST'; INSERT INTO coupons(code,type,value,allow_store_credits) VALUES('TEST','flat',10,1)");
    }
    return batch(statements);
  };
  await assert.rejects(purchase(env, buyer, 'stale-checkout'), error => error.status === 409 && /coupon changed/i.test(error.message));
  assert.notEqual(db.prepare("SELECT instance_id FROM coupons WHERE code='TEST'").get().instance_id, first.instance_id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM coupon_redemptions').get().n, 0);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get(items[0].id).stock, 50);
  assert.equal(db.prepare('SELECT balance FROM store_credit_accounts WHERE user_email=?').get(buyer.email).balance, 1000);
});

test('stale admin edit cannot overwrite a recreated coupon or its email targets', async t => {
  const { db, env } = fixture(t); await coupon(env, { email_targets: [buyer.email] });
  const batch = env.DB.batch; let calls = 0;
  env.DB.batch = statements => {
    if (++calls === 2) {
      db.exec("DELETE FROM coupon_email_targets WHERE coupon_code='TEST'; DELETE FROM coupons WHERE code='TEST'; INSERT INTO coupons(code,type,value) VALUES('TEST','flat',30); INSERT INTO coupon_email_targets(coupon_code,email) VALUES('TEST','new@example.com')");
    }
    return batch(statements);
  };
  const response = await worker.updateCoupon(request({ value: 20, email_targets: ['stale@example.com'] }), env, 'TEST');
  assert.equal(response.status, 409);
  assert.equal(db.prepare("SELECT value FROM coupons WHERE code='TEST'").get().value, 30);
  assert.equal(db.prepare("SELECT email FROM coupon_email_targets WHERE coupon_code='TEST'").get().email, 'new@example.com');
});

test('redemption input cannot forge whitelist exemption and snapshots cannot be rewritten', async t => {
  const { db, env } = fixture(t); await coupon(env);
  await purchase(env, buyer, 'normal');
  assert.throws(() => db.exec("INSERT INTO coupon_redemptions(id,coupon_code,customer_email,order_id,admin_exempt) VALUES('fake','TEST','buyer@example.com','fake-order',1)"), /limit reached/);
  assert.throws(() => db.exec('UPDATE coupon_redemptions SET admin_exempt=1'), /must match/);
  assert.throws(() => db.exec("UPDATE orders SET coupon_admin_exempt=1"), /immutable/);
  assert.throws(() => db.exec("UPDATE orders SET coupon_instance_id='other'"), /immutable/);
  assert.throws(() => db.exec("UPDATE coupons SET instance_id='other'"), /cannot be replaced/);
});

test('legacy SQL inserts are stamped and forged exempt input is reset to the server order value', async t => {
  const { db, env } = fixture(t); const created = await coupon(env, { usage_limit: 3 });
  db.exec("INSERT INTO orders(id,customer_email,items_json,subtotal,total,coupon_code) VALUES('legacy-checkout','buyer@example.com','[]',100,90,'TEST'); INSERT INTO coupon_redemptions(id,coupon_code,customer_email,order_id,admin_exempt) VALUES('legacy-use','TEST','buyer@example.com','legacy-checkout',1)");
  const row = db.prepare("SELECT * FROM coupon_redemptions WHERE id='legacy-use'").get();
  assert.equal(row.admin_exempt, 0); assert.equal(row.coupon_instance_id, created.instance_id);
  assert.equal(db.prepare("SELECT coupon_instance_id FROM orders WHERE id='legacy-checkout'").get().coupon_instance_id, created.instance_id);
});

test('whitelist benefits cannot mint credits, overspend wallets or bypass product stock', async t => {
  const { db, env } = fixture(t); await coupon(env, { allow_store_credits: false });
  await assert.rejects(purchase(env, buyer, 'no-stacking'), /cannot be combined/);
  db.exec("UPDATE store_credit_accounts SET balance=0 WHERE user_email='owner@example.com'");
  await assert.rejects(purchase(env, owner, 'no-balance'), /Store credits changed/);
  db.exec("UPDATE products SET stock=0 WHERE id='coupon-fixture-product'");
  await assert.rejects(purchase(env, owner, 'no-stock'), /sold out|left|stock/i);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0);
});

test('configured discount stays unchanged and cannot reduce the total below zero', async t => {
  const { env } = fixture(t); await coupon(env, { value: 200, max_discount: 1 });
  assert.equal((await validate(env, owner)).discount, 100);
  const response = await purchase(env, owner, 'zero', { credits_used: 0 });
  assert.equal(response.status, 201); assert.equal((await response.json()).order.total, 0);
  await worker.updateCoupon(request({ type: 'percent', value: 20, max_discount: 1 }), env, 'TEST');
  assert.equal((await validate(env, owner)).discount, 20);
});

test('checkout retries remain idempotent for exempt purchases', async t => {
  const { db, env } = fixture(t); await coupon(env);
  const first = await purchase(env, owner, 'retry'); const second = await purchase(env, owner, 'retry');
  assert.equal((await first.json()).order.id, (await second.json()).order.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM coupon_redemptions').get().n, 1);
  assert.equal(db.prepare('SELECT balance FROM store_credit_accounts WHERE user_email=?').get(owner.email).balance, 910);
});

test('populated migration preserves redemption history, including codes already deleted', t => {
  const { db } = fixture(t, { through: '0107_delivery_promise_snapshot.sql' });
  // through is inclusive by filename; explicitly ensure this is the pre-0108 schema.
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('coupons') WHERE name='instance_id'").get().n, 0);
  db.exec("INSERT INTO coupons(code,type,value) VALUES('TEST','flat',10),('OLD','flat',10); INSERT INTO orders(id,customer_email,items_json,subtotal,total,coupon_code) VALUES('past','buyer@example.com','[]',100,90,'TEST'),('orphan','buyer@example.com','[]',100,90,'OLD'); INSERT INTO coupon_redemptions(id,coupon_code,customer_email,order_id) VALUES('past-use','TEST','buyer@example.com','past'),('old-use','OLD','buyer@example.com','orphan'); DELETE FROM coupons WHERE code='OLD'");
  db.exec(readFileSync(new URL('../migrations/0108_coupon_instances_admin_exemption.sql', import.meta.url), 'utf8'));
  const identity = db.prepare("SELECT instance_id FROM coupons WHERE code='TEST'").get().instance_id;
  assert.match(identity, /^gmc_[0-9a-f]{32}$/);
  assert.equal(db.prepare("SELECT coupon_instance_id FROM orders WHERE id='past'").get().coupon_instance_id, identity);
  assert.equal(db.prepare("SELECT coupon_instance_id FROM orders WHERE id='orphan'").get().coupon_instance_id, 'legacy:OLD');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM coupon_redemptions').get().n, 2);
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
});
