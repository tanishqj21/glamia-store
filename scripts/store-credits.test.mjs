import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import {
  claimSignupReferral, creditAdminData, creditAuthority, creditWallet, decideCreditRefund,
  ensureReferralCode, grantStoreCredits, indiaCreditDay, qualifyCreditReferral, saveCreditSettings
} from "../src/store-credits.js";

function database() {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync(new URL("../migrations/", import.meta.url)).filter(name => name.endsWith(".sql")).sort()) {
    db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  const env = { DB: {
    async batch(statements) {
      const results = [];
      db.exec("BEGIN");
      try {
        for (const statement of statements) {
          const sql = statement.sql;
          const args = statement.args;
          const result = /^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql) ? db.prepare(sql).all(...args) : db.prepare(sql).run(...args);
          results.push(Array.isArray(result) ? { results: result } : { meta: { changes: result.changes } });
        }
        db.exec("COMMIT");
        return results;
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    }
  } };
  env.DB.prepare = sql => {
    const args = [];
    return {
      sql, args,
      bind(...values) { args.push(...values); return this; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { const info = db.prepare(sql).run(...args); return { meta: { changes: info.changes } }; }
    };
  };
  return { db, env };
}
const addUser = (db, email, open = 0) => db.prepare("INSERT INTO users(email,google_sub,referral_onboarding_open) VALUES (?,?,?)").run(email, email, open);
const balance = (db, email) => db.prepare("SELECT balance FROM store_credit_accounts WHERE user_email = ?").get(email)?.balance || 0;
const actor = (email, id, position = "manager") => ({ email, role: "admin", employee_id: id, employee_position: position, employee_permissions: { credits: true } });

test("manual grants enforce shared India-day allowance, whitelist, and idempotency", async () => {
  const { db, env } = database();
  addUser(db, "customer@example.com");
  const manager = actor("manager@example.com", "manager-1");
  const managerAuthority = creditAuthority(manager);
  assert.equal(managerAuthority.daily_limit, 4000);
  const first = await grantStoreCredits(env, manager, managerAuthority, { email: "customer@example.com", amount: 3000, reason: "Goodwill", idempotency_key: "unique-manager-grant-1" });
  assert.equal(first.idempotent, false);
  const retry = await grantStoreCredits(env, manager, managerAuthority, { email: "customer@example.com", amount: 3000, reason: "Goodwill", idempotency_key: "unique-manager-grant-1" });
  assert.equal(retry.idempotent, true);
  await assert.rejects(grantStoreCredits(env, manager, managerAuthority, { email: "customer@example.com", amount: 3001, reason: "Different", idempotency_key: "unique-manager-grant-1" }), /different grant/);
  await grantStoreCredits(env, manager, managerAuthority, { email: "customer@example.com", amount: 1000, reason: "Adjustment", idempotency_key: "unique-manager-grant-2" });
  await assert.rejects(grantStoreCredits(env, manager, managerAuthority, { email: "customer@example.com", amount: 1, reason: "Too much", idempotency_key: "unique-manager-grant-3" }), /daily credit allowance/);
  assert.equal(balance(db, "customer@example.com"), 4000);
  const admin = actor("admin@example.com", "admin-1", "admin");
  await grantStoreCredits(env, admin, creditAuthority(admin), { email: "customer@example.com", amount: 10000, reason: "Admin limit", idempotency_key: "unique-admin-grant-1" });
  await assert.rejects(grantStoreCredits(env, admin, creditAuthority(admin), { email: "customer@example.com", amount: 1, reason: "Over", idempotency_key: "unique-admin-grant-2" }), /daily credit allowance/);
  const owner = actor("owner@example.com", "owner-1", "admin");
  await grantStoreCredits(env, owner, creditAuthority(owner, true), { email: "customer@example.com", amount: 11000, reason: "Owner grant", idempotency_key: "unique-owner-grant-1" });
  assert.equal(balance(db, "customer@example.com"), 25000);
  assert.equal(creditAuthority({ ...manager, employee_permissions: {} }).allowed, false);
  assert.equal(indiaCreditDay(new Date("2026-09-29T18:29:59Z")), "2026-09-29");
  assert.equal(indiaCreditDay(new Date("2026-09-29T18:30:00Z")), "2026-09-30");
});

test("checkout debits atomically, forbids coupon stacking without permission, restores cancellation once", () => {
  const { db } = database();
  addUser(db, "buyer@example.com");
  db.prepare("INSERT INTO store_credit_ledger(id,user_email,amount,kind,description,idempotency_key) VALUES ('seed','buyer@example.com',1000,'opening','seed','seed')").run();
  db.prepare("INSERT INTO coupons(code,type,value,allow_store_credits) VALUES ('NO','flat',100,0),('YES','flat',100,1)").run();
  const order = (id, credits, coupon = null) => db.prepare("INSERT INTO orders(id,customer_email,items_json,subtotal,total,coupon_code,credits_used,payable_total) VALUES (?,?, '[]',1000,900,?,?,?)").run(id, "buyer@example.com", coupon, credits, 900 - credits);
  assert.throws(() => order("not-allowed", 300, "NO"), /Coupon cannot be combined/);
  assert.equal(balance(db, "buyer@example.com"), 1000);
  order("good", 600, "YES");
  assert.equal(balance(db, "buyer@example.com"), 400);
  assert.throws(() => order("insufficient", 500), /Insufficient store credits/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders WHERE id = 'insufficient'").get().n, 0);
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = 'good'").run();
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = 'good'").run();
  assert.equal(balance(db, "buyer@example.com"), 1000);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM store_credit_ledger WHERE idempotency_key = 'release:good'").get().n, 1);
});

test("refund credit requires whitelist approval and returned receipt in either order", async () => {
  const { db, env } = database();
  addUser(db, "buyer@example.com");
  db.prepare("INSERT INTO orders(id,customer_email,items_json,subtotal,total) VALUES ('order-1','buyer@example.com','[]',900,900),('order-2','buyer@example.com','[]',700,700)").run();
  const makeRequest = (id, order, amount) => db.prepare("INSERT INTO return_requests(id,order_id,customer_email,type,reason,refund_destination,refund_amount) VALUES (?,?, 'buyer@example.com','refund','Return','store_credit',?)").run(id, order, amount);
  makeRequest("return-1", "order-1", 900);
  makeRequest("return-2", "order-2", 700);
  const manager = actor("manager@example.com", "manager-1");
  await assert.rejects(decideCreditRefund(env, manager, creditAuthority(manager), "return-1", "approved"), /whitelisted admin/);
  const owner = actor("owner@example.com", "owner-1", "admin");
  await decideCreditRefund(env, owner, creditAuthority(owner, true), "return-1", "approved");
  assert.equal(balance(db, "buyer@example.com"), 0);
  db.prepare("UPDATE return_requests SET status='received', returned_at=CURRENT_TIMESTAMP WHERE id='return-1'").run();
  assert.equal(balance(db, "buyer@example.com"), 900);
  db.prepare("UPDATE return_requests SET status='received', returned_at=CURRENT_TIMESTAMP WHERE id='return-2'").run();
  await decideCreditRefund(env, owner, creditAuthority(owner, true), "return-2", "approved");
  await decideCreditRefund(env, owner, creditAuthority(owner, true), "return-2", "approved");
  assert.equal(balance(db, "buyer@example.com"), 1600);
  assert.equal(db.prepare("SELECT credit_approval_status FROM return_requests WHERE id='return-2'").get().credit_approval_status, "credited");
});

test("one referral code at signup; first successful payment rewards both wallets once", async () => {
  const { db, env } = database();
  addUser(db, "referrer@example.com");
  addUser(db, "friend@example.com", 1);
  const code = await ensureReferralCode(env, "referrer@example.com");
  assert.match(code, /^\d{7}$/);
  await claimSignupReferral(env, "friend@example.com", code);
  assert.equal(db.prepare("SELECT status FROM referral_rewards WHERE referred_email='friend@example.com'").get().status, "pending");
  await assert.rejects(claimSignupReferral(env, "friend@example.com", code), /only be entered once/);
  await assert.rejects(claimSignupReferral(env, "referrer@example.com", code), /only be entered once/);
  const owner = actor("owner@example.com", "owner-1", "admin");
  const order = { id: "order-3", customer_email: "friend@example.com", status: "confirmed", payment_status: "paid", payment_method: "razorpay", total: 500, payable_total: 500, created_at: "2026-09-29 12:00:00" };
  db.prepare("INSERT INTO orders(id,customer_email,items_json,subtotal,total,status,payment_method,payment_status,payable_total,created_at) VALUES ('order-3','friend@example.com','[]',500,500,'pending','razorpay','pending',500,'2026-09-29 12:00:00')").run();
  assert.equal(balance(db, "friend@example.com"), 0);
  db.prepare("UPDATE orders SET status='confirmed',payment_status='paid' WHERE id='order-3'").run();
  assert.equal(balance(db, "friend@example.com"), 100);
  assert.equal(balance(db, "referrer@example.com"), 50);
  db.prepare("UPDATE orders SET payment_status='paid' WHERE id='order-3'").run();
  await qualifyCreditReferral(env, order);
  await qualifyCreditReferral(env, order);
  assert.equal(balance(db, "referrer@example.com"), 50);
  assert.equal(balance(db, "friend@example.com"), 100);
  const records = db.prepare("SELECT user_email,amount,order_id FROM store_credit_ledger WHERE kind LIKE 'referral%' ORDER BY amount").all();
  assert.deepEqual(records.map(row => [row.user_email,row.amount,row.order_id]), [["referrer@example.com",50,"order-3"],["friend@example.com",100,"order-3"]]);
  await saveCreditSettings(env, owner, creditAuthority(owner, true), { referral_reward: 75, referred_reward: 125 });
  db.prepare("INSERT INTO orders(id,customer_email,items_json,subtotal,total,status,payment_method,payment_status) VALUES ('order-4','friend@example.com','[]',500,500,'confirmed','phonepe','paid')").run();
  assert.equal(balance(db, "friend@example.com"), 100);
  assert.equal(balance(db, "referrer@example.com"), 50);
  assert.equal((await creditWallet(env, { email: "referrer@example.com" })).successful_referrals, 1);
  // Delivery updates and repeated payment callbacks must not award this pair again.
  db.prepare("UPDATE orders SET status='delivered',payment_status='paid' WHERE id='order-3'").run();
  db.prepare("UPDATE orders SET status='delivered',payment_status='paid' WHERE id='order-4'").run();
  await qualifyCreditReferral(env, { ...order, status: 'delivered' });
  assert.equal(balance(db, "friend@example.com"), 100);
  assert.equal(balance(db, "referrer@example.com"), 50);
  const adminLog = await creditAdminData(env, owner, creditAuthority(owner, true));
  const referralLog = adminLog.referrals.find(entry => entry.referred_email === 'friend@example.com');
  assert.equal(referralLog.referrer_email, 'referrer@example.com');
  assert.equal(referralLog.qualifying_order_id, 'order-3');
  assert.equal(referralLog.reward_amount, 50);
  assert.equal(referralLog.referred_reward_amount, 100);
  assert.ok(referralLog.qualified_at);
  const payoutLog = adminLog.ledger.filter(entry => entry.kind.startsWith('referral'));
  assert.equal(payoutLog.length, 2, 'Admins see one entry for each recipient, without duplicate payouts');
  assert.ok(payoutLog.every(entry => entry.order_id === 'order-3' && entry.created_at));
});

test("bills snapshot purchases once and survive refunds; incomplete and demo payments have no bill or reward", async () => {
  const { db, env } = database();
  addUser(db, "invite@example.com"); addUser(db, "new@example.com", 1);
  await claimSignupReferral(env, "new@example.com", await ensureReferralCode(env, "invite@example.com"));
  db.prepare("INSERT INTO orders(id,customer_email,items_json,subtotal,total,status,payment_method,payment_status) VALUES ('demo','new@example.com','[]',500,500,'confirmed','demo','paid'),('failed','new@example.com','[]',500,500,'pending','razorpay','failed')").run();
  assert.equal(balance(db, "new@example.com"), 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_bills").get().n, 0);
  db.prepare("INSERT INTO orders(id,order_number,customer_email,items_json,subtotal,total,status,payment_method,payment_status) VALUES ('live','GM-TEST-1','new@example.com','[]',500,500,'confirmed','phonepe','paid')").run();
  const bill = db.prepare("SELECT * FROM order_bills WHERE order_id='live'").get();
  assert.equal(JSON.parse(bill.snapshot_json).total, 500);
  db.prepare("UPDATE orders SET payment_status='refunded',status='cancelled',total=0 WHERE id='live'").run();
  assert.equal(db.prepare("SELECT snapshot_json FROM order_bills WHERE order_id='live'").get().snapshot_json, bill.snapshot_json);
  assert.throws(() => db.prepare("UPDATE order_bills SET bill_number='changed'").run(), /cannot be edited/);
  assert.equal(balance(db, "invite@example.com"), 50); assert.equal(balance(db, "new@example.com"), 100);
});

test("full wallet payments qualify and both rewards roll back if either wallet cannot accept its reward", async () => {
  const { db, env } = database();
  for (const email of ["invite@example.com", "friend@example.com", "overflow@example.com"]) addUser(db,email,1);
  const code = await ensureReferralCode(env, "invite@example.com");
  await claimSignupReferral(env,"friend@example.com",code);
  assert.throws(() => db.prepare("INSERT INTO orders(id,customer_email,items_json,subtotal,total,status,payment_method,payment_status,credits_used,payable_total) VALUES ('unfunded-wallet','friend@example.com','[]',100,100,'confirmed','store_credit','paid',100,0)").run(), /Insufficient store credits/);
  db.prepare("INSERT INTO store_credit_ledger(id,user_email,amount,kind,idempotency_key) VALUES ('seed-full','friend@example.com',500,'opening','seed-full')").run();
  db.prepare("INSERT INTO orders(id,customer_email,items_json,subtotal,total,status,payment_method,payment_status,credits_used,payable_total) VALUES ('wallet-order','friend@example.com','[]',500,500,'confirmed','store_credit','paid',500,0)").run();
  assert.equal(balance(db,"friend@example.com"),100); assert.equal(balance(db,"invite@example.com"),50);
  await claimSignupReferral(env,"overflow@example.com",code);
  db.prepare("INSERT INTO store_credit_ledger(id,user_email,amount,kind,idempotency_key) VALUES ('seed-max','overflow@example.com',9007199254740991,'opening','seed-max')").run();
  assert.throws(() => db.prepare("INSERT INTO orders(id,customer_email,items_json,subtotal,total,status,payment_method,payment_status) VALUES ('overflow-order','overflow@example.com','[]',500,500,'confirmed','razorpay','paid')").run(), /safe limit/);
  assert.equal(balance(db,"invite@example.com"),50);
  assert.equal(db.prepare("SELECT status FROM referral_rewards WHERE referred_email='overflow@example.com'").get().status,'pending');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_bills WHERE order_id='overflow-order'").get().n,0);
});
