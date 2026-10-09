-- Reward amounts are snapshotted when the first successful payment is recorded.
ALTER TABLE store_credit_settings ADD COLUMN referred_reward INTEGER NOT NULL DEFAULT 100 CHECK (referred_reward >= 0);
ALTER TABLE referral_rewards ADD COLUMN referred_reward_amount INTEGER NOT NULL DEFAULT 0;
UPDATE store_credit_settings SET referral_reward = 50, referred_reward = 100, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
-- A reward from this purchase cannot fund the purchase that earned it.
CREATE TRIGGER credit_checkout_funding_guard BEFORE INSERT ON orders WHEN NEW.credits_used > 0
BEGIN
  SELECT CASE WHEN COALESCE((SELECT balance FROM store_credit_accounts WHERE user_email=NEW.customer_email),0) < NEW.credits_used
    THEN RAISE(ABORT,'Insufficient store credits') END;
END;
DROP TRIGGER credit_referral_qualified;
CREATE TRIGGER credit_referral_qualified AFTER UPDATE OF status ON referral_rewards
WHEN NEW.status = 'qualified' AND OLD.status = 'pending'
BEGIN
  INSERT OR IGNORE INTO store_credit_ledger(id,user_email,amount,kind,description,order_id,idempotency_key)
  SELECT 'referral:' || NEW.referred_email, NEW.referrer_email, NEW.reward_amount, 'referral',
    'Referral reward for inviting ' || NEW.referred_email, NEW.qualifying_order_id, 'referral:' || NEW.referred_email
  WHERE NEW.reward_amount > 0;
  INSERT OR IGNORE INTO store_credit_ledger(id,user_email,amount,kind,description,order_id,idempotency_key)
  SELECT 'referral-welcome:' || NEW.referred_email, NEW.referred_email, NEW.referred_reward_amount, 'referral_received',
    'First-order referral reward from ' || NEW.referrer_email, NEW.qualifying_order_id, 'referral-welcome:' || NEW.referred_email
  WHERE NEW.referred_reward_amount > 0;
END;
CREATE TRIGGER credit_order_referral_insert AFTER INSERT ON orders
WHEN NEW.payment_status = 'paid' AND NEW.status != 'cancelled' AND NEW.total > 0
 AND NEW.payment_method IN ('razorpay','phonepe','store_credit') AND COALESCE(NEW.order_type,'standard') != 'replacement'
BEGIN
  UPDATE referral_rewards SET status = 'qualified', reward_amount = (SELECT referral_reward FROM store_credit_settings WHERE id = 1),
    referred_reward_amount = (SELECT referred_reward FROM store_credit_settings WHERE id = 1), qualifying_order_id = NEW.id, qualified_at = CURRENT_TIMESTAMP
  WHERE referred_email = NEW.customer_email AND status = 'pending';
END;
CREATE TRIGGER credit_order_referral_update AFTER UPDATE OF payment_status, status ON orders
WHEN NEW.payment_status = 'paid' AND NEW.status != 'cancelled' AND NEW.total > 0
 AND NEW.payment_method IN ('razorpay','phonepe','store_credit') AND COALESCE(NEW.order_type,'standard') != 'replacement'
BEGIN
  UPDATE referral_rewards SET status = 'qualified', reward_amount = (SELECT referral_reward FROM store_credit_settings WHERE id = 1),
    referred_reward_amount = (SELECT referred_reward FROM store_credit_settings WHERE id = 1), qualifying_order_id = NEW.id, qualified_at = CURRENT_TIMESTAMP
  WHERE referred_email = NEW.customer_email AND status = 'pending';
END;

-- Keep the original purchase and seller details for downloadable customer bills.
CREATE TABLE order_bills (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  bill_number TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  seller_json TEXT NOT NULL,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_order_bills_issued ON order_bills(issued_at DESC, order_id);
CREATE TRIGGER order_bill_insert AFTER INSERT ON orders
WHEN NEW.payment_status = 'paid' AND NEW.status != 'cancelled'
 AND NEW.payment_method IN ('razorpay','phonepe','store_credit') AND COALESCE(NEW.order_type,'standard') != 'replacement'
BEGIN
  INSERT OR IGNORE INTO order_bills(order_id,bill_number,snapshot_json,seller_json)
  SELECT NEW.id, COALESCE(NEW.order_number,NEW.id),
    json_object('id',NEW.id,'order_number',NEW.order_number,'customer_email',NEW.customer_email,'customer_name',NEW.customer_name,
      'items_json',NEW.items_json,'subtotal',NEW.subtotal,'discount',NEW.discount,'total',NEW.total,'credits_used',NEW.credits_used,
      'payable_total',NEW.payable_total,'payment_method',NEW.payment_method,'payment_status',NEW.payment_status,
      'payment_reference',NEW.payment_reference,'shipping_json',NEW.shipping_json,'created_at',NEW.created_at),
    COALESCE((SELECT json_object('business_state',business_state,'business_state_code',business_state_code,'gstin',gstin) FROM tax_settings WHERE id=1),'{}');
END;
CREATE TRIGGER order_bill_update AFTER UPDATE OF payment_status, status ON orders
WHEN NEW.payment_status = 'paid' AND NEW.status != 'cancelled'
 AND NEW.payment_method IN ('razorpay','phonepe','store_credit') AND COALESCE(NEW.order_type,'standard') != 'replacement'
BEGIN
  INSERT OR IGNORE INTO order_bills(order_id,bill_number,snapshot_json,seller_json)
  SELECT NEW.id, COALESCE(NEW.order_number,NEW.id),
    json_object('id',NEW.id,'order_number',NEW.order_number,'customer_email',NEW.customer_email,'customer_name',NEW.customer_name,
      'items_json',NEW.items_json,'subtotal',NEW.subtotal,'discount',NEW.discount,'total',NEW.total,'credits_used',NEW.credits_used,
      'payable_total',NEW.payable_total,'payment_method',NEW.payment_method,'payment_status',NEW.payment_status,
      'payment_reference',NEW.payment_reference,'shipping_json',NEW.shipping_json,'created_at',NEW.created_at),
    COALESCE((SELECT json_object('business_state',business_state,'business_state_code',business_state_code,'gstin',gstin) FROM tax_settings WHERE id=1),'{}');
END;
INSERT OR IGNORE INTO order_bills(order_id,bill_number,snapshot_json,seller_json,issued_at)
SELECT o.id,COALESCE(o.order_number,o.id),
  json_object('id',o.id,'order_number',o.order_number,'customer_email',o.customer_email,'customer_name',o.customer_name,
    'items_json',o.items_json,'subtotal',o.subtotal,'discount',o.discount,'total',o.total,'credits_used',o.credits_used,
    'payable_total',o.payable_total,'payment_method',o.payment_method,'payment_status','paid',
    'payment_reference',o.payment_reference,'shipping_json',o.shipping_json,'created_at',o.created_at),
  COALESCE((SELECT json_object('business_state',business_state,'business_state_code',business_state_code,'gstin',gstin) FROM tax_settings WHERE id=1),'{}'),
  COALESCE(o.payment_updated_at,o.created_at,CURRENT_TIMESTAMP)
FROM orders o WHERE o.payment_status IN ('paid','refunded') AND o.payment_method IN ('razorpay','phonepe','store_credit')
 AND COALESCE(o.order_type,'standard') != 'replacement';
CREATE TRIGGER order_bill_immutable BEFORE UPDATE ON order_bills
BEGIN SELECT RAISE(ABORT,'Issued bills cannot be edited'); END;
