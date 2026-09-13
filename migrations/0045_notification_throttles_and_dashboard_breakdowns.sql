-- Add repeat-safe stock alert throttling and support a distinct out-of-stock type.
-- Stock alerts remain as rows after they are cleared so the server can enforce
-- the cooldown instead of recreating them on every admin refresh.
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS admin_notifications_new;
CREATE TABLE admin_notifications_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN (
    'new_order', 'low_stock', 'out_of_stock', 'new_review', 'return_request',
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_triggered_at TEXT
);

INSERT INTO admin_notifications_new
  (id, type, priority, title, message, dedupe_key, order_id, product_id, review_id,
   read_at, dismissed_at, created_at, last_triggered_at)
SELECT id, type, priority, title, message, dedupe_key, order_id, product_id, review_id,
  read_at, dismissed_at, created_at, created_at
FROM admin_notifications;

DROP TABLE admin_notifications;
ALTER TABLE admin_notifications_new RENAME TO admin_notifications;

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_state ON admin_notifications(dismissed_at, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_priority ON admin_notifications(priority, read_at, created_at DESC);

PRAGMA foreign_keys = ON;
