-- Expand the admin notification center and make replacement exchanges first-class orders.
-- Existing notification rows are preserved while the type constraint is widened.
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS admin_notifications_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN (
    'new_order', 'low_stock', 'new_review', 'return_request',
    'exchange_request', 'support_ticket', 'cancelled_order'
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO admin_notifications_new
  (id, type, priority, title, message, dedupe_key, order_id, product_id, review_id, read_at, dismissed_at, created_at)
SELECT id, type,
  CASE WHEN type = 'low_stock' THEN 'high' ELSE 'normal' END,
  title, message, dedupe_key, order_id, product_id, review_id, read_at, dismissed_at, created_at
FROM admin_notifications;

DROP TABLE admin_notifications;
ALTER TABLE admin_notifications_new RENAME TO admin_notifications;

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_state ON admin_notifications(dismissed_at, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_priority ON admin_notifications(priority, read_at, created_at DESC);

PRAGMA foreign_keys = ON;

ALTER TABLE orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE orders ADD COLUMN replacement_for_order_id TEXT;
ALTER TABLE orders ADD COLUMN replacement_request_id TEXT;
ALTER TABLE return_requests ADD COLUMN replacement_order_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_replacement_for ON orders(replacement_for_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_replacement_request
  ON orders(replacement_request_id) WHERE replacement_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_return_requests_replacement_order ON return_requests(replacement_order_id);

-- The replacement order is inserted before its stock decrement inside one D1 batch.
-- This trigger makes the batch abort if either product-level or size-level stock
-- changed between validation and the write, preventing overselling under concurrency.
CREATE TRIGGER IF NOT EXISTS prevent_unavailable_replacement_stock
BEFORE INSERT ON orders
WHEN NEW.order_type = 'replacement'
  AND (
    NOT EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = json_extract(NEW.items_json, '$[0].id')
        AND p.stock >= CAST(json_extract(NEW.items_json, '$[0].quantity') AS INTEGER)
    )
    OR NOT EXISTS (
      SELECT 1 FROM product_sizes ps
      WHERE ps.product_id = json_extract(NEW.items_json, '$[0].id')
        AND ps.size = json_extract(NEW.items_json, '$[0].size')
        AND ps.stock >= CAST(json_extract(NEW.items_json, '$[0].quantity') AS INTEGER)
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'Insufficient replacement stock');
END;
