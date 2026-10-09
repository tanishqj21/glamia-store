-- Credits are INR tender, not a product discount. Preserve existing balances.
ALTER TABLE coupons ADD COLUMN allow_store_credits INTEGER NOT NULL DEFAULT 0 CHECK (allow_store_credits IN (0, 1));
ALTER TABLE orders ADD COLUMN credits_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN payable_total INTEGER;
ALTER TABLE users ADD COLUMN referral_onboarding_open INTEGER NOT NULL DEFAULT 0;
ALTER TABLE store_credit_ledger ADD COLUMN actor_key TEXT;
ALTER TABLE store_credit_ledger ADD COLUMN actor_email TEXT;
ALTER TABLE store_credit_ledger ADD COLUMN grant_day TEXT;
ALTER TABLE store_credit_ledger ADD COLUMN daily_limit INTEGER;
ALTER TABLE store_credit_ledger ADD COLUMN idempotency_key TEXT;
ALTER TABLE referral_rewards ADD COLUMN status TEXT NOT NULL DEFAULT 'legacy_awarded';
ALTER TABLE referral_rewards ADD COLUMN reward_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE referral_rewards ADD COLUMN qualifying_order_id TEXT;
ALTER TABLE referral_rewards ADD COLUMN qualified_at TEXT;
ALTER TABLE return_requests ADD COLUMN credit_approval_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE return_requests ADD COLUMN credit_approved_by TEXT;
ALTER TABLE return_requests ADD COLUMN credit_approved_at TEXT;
ALTER TABLE return_requests ADD COLUMN returned_at TEXT;
ALTER TABLE admin_notifications ADD COLUMN owner_only INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_credit_idempotency ON store_credit_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_credit_daily_grants ON store_credit_ledger(actor_key, grant_day, kind);
CREATE INDEX idx_credit_referral_rank ON referral_rewards(referrer_email, status);
CREATE INDEX idx_credit_refund_approvals ON return_requests(refund_destination, credit_approval_status, status);
CREATE TABLE store_credit_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  referral_reward INTEGER NOT NULL DEFAULT 0 CHECK (referral_reward >= 0),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO store_credit_settings(id) VALUES (1);
INSERT INTO store_credit_accounts(user_email, balance)
SELECT user_email, SUM(amount) FROM store_credit_ledger WHERE 1
GROUP BY user_email ON CONFLICT(user_email) DO NOTHING;
INSERT INTO store_credit_ledger(id, user_email, amount, kind, description, idempotency_key)
SELECT 'opening:' || a.user_email, a.user_email,
  a.balance - COALESCE((SELECT SUM(l.amount) FROM store_credit_ledger l WHERE l.user_email = a.user_email), 0),
  'opening', 'Balance carried forward', 'opening:' || a.user_email
FROM store_credit_accounts a WHERE a.balance != COALESCE((SELECT SUM(l.amount) FROM store_credit_ledger l WHERE l.user_email = a.user_email), 0);
UPDATE return_requests SET credit_approval_status = 'credited' WHERE id IN (SELECT return_request_id FROM store_credit_ledger WHERE return_request_id IS NOT NULL);
UPDATE return_requests SET returned_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
WHERE status IN ('received', 'refunded') AND returned_at IS NULL;

-- The write guards run inside D1's transaction, including concurrent requests.
CREATE TRIGGER credit_ledger_guard BEFORE INSERT ON store_credit_ledger
WHEN NEW.idempotency_key IS NULL OR NOT EXISTS (SELECT 1 FROM store_credit_ledger WHERE idempotency_key = NEW.idempotency_key)
BEGIN
  SELECT CASE WHEN typeof(NEW.amount) != 'integer' OR NEW.amount = 0 THEN RAISE(ABORT, 'Invalid credit amount') END;
  SELECT CASE WHEN NEW.amount > 9007199254740991 OR NEW.amount < -9007199254740991 OR (NEW.amount > 0 AND COALESCE((SELECT balance FROM store_credit_accounts WHERE user_email = NEW.user_email), 0) > 9007199254740991 - NEW.amount) THEN RAISE(ABORT, 'Credit balance exceeds safe limit') END;
  SELECT CASE WHEN COALESCE((SELECT balance FROM store_credit_accounts WHERE user_email = NEW.user_email), 0) + NEW.amount < 0 THEN RAISE(ABORT, 'Insufficient store credits') END;
  SELECT CASE WHEN NEW.kind = 'manual' AND (NEW.amount < 0 OR NEW.actor_key IS NULL OR NEW.grant_day IS NULL) THEN RAISE(ABORT, 'Invalid credit grant') END;
  SELECT CASE WHEN NEW.kind = 'manual' AND NEW.daily_limit IS NOT NULL AND NEW.amount + COALESCE((SELECT SUM(amount) FROM store_credit_ledger WHERE actor_key = NEW.actor_key AND grant_day = NEW.grant_day AND kind = 'manual'), 0) > NEW.daily_limit THEN RAISE(ABORT, 'Daily store credit limit reached') END;
END;
CREATE TRIGGER credit_balance_apply AFTER INSERT ON store_credit_ledger
BEGIN
  INSERT INTO store_credit_accounts(user_email, balance, updated_at) VALUES (NEW.user_email, NEW.amount, CURRENT_TIMESTAMP)
  ON CONFLICT(user_email) DO UPDATE SET balance = store_credit_accounts.balance + NEW.amount, updated_at = CURRENT_TIMESTAMP;
END;
CREATE TRIGGER credit_amount_immutable BEFORE UPDATE OF amount, kind, idempotency_key, actor_key, grant_day ON store_credit_ledger
BEGIN SELECT RAISE(ABORT, 'Credit ledger entries are immutable'); END;

CREATE TRIGGER credit_checkout_guard BEFORE INSERT ON orders
BEGIN
  SELECT CASE WHEN typeof(NEW.credits_used) != 'integer' OR NEW.credits_used < 0 OR NEW.credits_used > NEW.total THEN RAISE(ABORT, 'Invalid checkout credits') END;
  SELECT CASE WHEN NEW.credits_used > 0 AND NOT EXISTS (SELECT 1 FROM users WHERE email = NEW.customer_email) THEN RAISE(ABORT, 'Store credits require a registered account') END;
  SELECT CASE WHEN NEW.credits_used > 0 AND NEW.coupon_code IS NOT NULL AND NOT EXISTS (SELECT 1 FROM coupons WHERE code = NEW.coupon_code AND allow_store_credits = 1) THEN RAISE(ABORT, 'Coupon cannot be combined with store credits') END;
END;
CREATE TRIGGER credit_checkout_debit AFTER INSERT ON orders WHEN NEW.credits_used > 0
BEGIN
  INSERT INTO store_credit_ledger(id, user_email, amount, kind, description, order_id, idempotency_key)
  VALUES ('spend:' || NEW.id, NEW.customer_email, -NEW.credits_used, 'checkout', 'Store credits used at checkout', NEW.id, 'spend:' || NEW.id);
END;
CREATE TRIGGER credit_checkout_release AFTER UPDATE OF status ON orders
WHEN NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND NEW.credits_used > 0
BEGIN
  INSERT OR IGNORE INTO store_credit_ledger(id, user_email, amount, kind, description, order_id, idempotency_key)
  VALUES ('release:' || NEW.id, NEW.customer_email, NEW.credits_used, 'checkout_release', 'Credits restored after cancellation', NEW.id, 'release:' || NEW.id);
END;

-- Approval and receipt may happen in either order. The unique return key prevents double refunds.
CREATE TRIGGER credit_return_release AFTER UPDATE OF status, credit_approval_status ON return_requests
WHEN NEW.type = 'refund' AND NEW.refund_destination = 'store_credit'
 AND NEW.credit_approval_status = 'approved' AND NEW.returned_at IS NOT NULL
 AND NEW.status IN ('received', 'refunded') AND NEW.refund_amount > 0
BEGIN
  INSERT OR IGNORE INTO store_credit_ledger(id, user_email, amount, kind, description, order_id, return_request_id, actor_email, idempotency_key)
  VALUES ('refund:' || NEW.id, NEW.customer_email, NEW.refund_amount, 'refund', 'Approved returned-order refund', NEW.order_id, NEW.id, NEW.credit_approved_by, 'refund:' || NEW.id);
  UPDATE return_requests SET status = 'refunded', credit_approval_status = 'credited', refund_processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER credit_referral_qualified AFTER UPDATE OF status ON referral_rewards
WHEN NEW.status = 'qualified' AND OLD.status = 'pending' AND NEW.reward_amount > 0
BEGIN
  INSERT OR IGNORE INTO store_credit_ledger(id, user_email, amount, kind, description, order_id, idempotency_key)
  VALUES ('referral:' || NEW.referred_email, NEW.referrer_email, NEW.reward_amount, 'referral', 'Reward for a successful referral', NEW.qualifying_order_id, 'referral:' || NEW.referred_email);
END;
