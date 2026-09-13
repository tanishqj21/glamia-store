-- Production-readiness foundations: customer after-sales workflows,
-- inventory reservation history, email delivery observability, retention
-- subscriptions, and an admin audit trail.
CREATE TABLE IF NOT EXISTS return_requests (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('return', 'exchange', 'refund')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'received', 'refunded', 'completed', 'cancelled')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_return_requests_order ON return_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_customer ON return_requests(customer_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_requests_status ON return_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  size TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'committed' CHECK (status IN ('committed', 'released')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_order ON inventory_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_product ON inventory_reservations(product_id, status);

CREATE TABLE IF NOT EXISTS email_delivery_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  order_id TEXT,
  user_email TEXT,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT,
  last_error TEXT,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_delivery_status ON email_delivery_log(status, next_attempt_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_delivery_order ON email_delivery_log(order_id, event_type);

CREATE TABLE IF NOT EXISTS restock_subscriptions (
  user_email TEXT NOT NULL,
  product_id TEXT NOT NULL,
  size TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notified_at TEXT,
  PRIMARY KEY (user_email, product_id, size)
);
CREATE INDEX IF NOT EXISTS idx_restock_subscriptions_product ON restock_subscriptions(product_id, notified_at);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);
