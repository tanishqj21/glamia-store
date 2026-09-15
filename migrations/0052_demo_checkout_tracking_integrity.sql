-- Demo-only checkout, private order tracking, idempotent refunds, and product-question alerts.

ALTER TABLE orders ADD COLUMN tracking_token TEXT;

-- Existing orders receive opaque tracking credentials. New orders generate the
-- same kind of token in the Worker before they are returned to the customer.
UPDATE orders
SET tracking_token = LOWER(HEX(RANDOMBLOB(16)))
WHERE tracking_token IS NULL OR tracking_token = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_token
  ON orders(tracking_token)
  WHERE tracking_token IS NOT NULL;

ALTER TABLE store_credit_ledger ADD COLUMN return_request_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_credit_ledger_return_request
  ON store_credit_ledger(return_request_id)
  WHERE return_request_id IS NOT NULL;

-- 0045 rebuilt this table before product questions existed. Rebuild it once
-- more so product-question notifications satisfy the same database contract
-- as every other admin notification.
PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS admin_notifications_new;
CREATE TABLE admin_notifications_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN (
    'new_order', 'low_stock', 'out_of_stock', 'new_review', 'product_question',
    'return_request', 'exchange_request', 'support_ticket', 'cancelled_order'
  )),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  order_id TEXT,
  product_id TEXT,
  review_id TEXT,
  read_at TEXT,
  dismissed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_triggered_at TEXT
);
INSERT INTO admin_notifications_new
  (id, type, priority, title, message, dedupe_key, order_id, product_id, review_id,
   read_at, dismissed_at, created_at, last_triggered_at)
SELECT id, type, priority, title, message, dedupe_key, order_id, product_id, review_id,
  read_at, dismissed_at, created_at, last_triggered_at
FROM admin_notifications;
DROP TABLE admin_notifications;
ALTER TABLE admin_notifications_new RENAME TO admin_notifications;
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_state ON admin_notifications(dismissed_at, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_priority ON admin_notifications(priority, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_visibility_created ON admin_notifications(dismissed_at, read_at, created_at DESC);

UPDATE storefront_settings
SET value_json = json_set(value_json, '$.text', 'Complimentary shipping across India · Demo checkout available')
WHERE setting_key = 'announcement'
  AND json_extract(value_json, '$.text') = 'Complimentary shipping across India · Cash on Delivery available';

UPDATE storefront_settings
SET value_json = json_set(json_set(value_json, '$.items[2].title', 'Demo Checkout'), '$.items[2].body', 'No money is charged')
WHERE setting_key = 'trust_strip'
  AND json_extract(value_json, '$.items[2].title') = 'Cash on Delivery';

PRAGMA foreign_keys = ON;
