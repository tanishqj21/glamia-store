-- Persistent admin alerts and printable courier label identifiers.
ALTER TABLE orders ADD COLUMN order_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

UPDATE orders
SET order_number = 'GM-' || substr(replace(created_at, '-', ''), 1, 8) || '-' || upper(substr(replace(id, '-', ''), 1, 8))
WHERE order_number IS NULL OR order_number = '';

CREATE TABLE IF NOT EXISTS admin_notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('new_order', 'low_stock', 'new_review')),
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

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_state ON admin_notifications(dismissed_at, read_at, created_at DESC);
