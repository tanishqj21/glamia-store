-- Employee packing workflow: separate staff credentials, revocable sessions,
-- packing state on orders, and an audit trail for warehouse actions.

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  employee_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 120000,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employees_active_code
  ON employees(active, employee_code);

CREATE TABLE IF NOT EXISTS employee_sessions (
  token_hash TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_employee_sessions_employee
  ON employee_sessions(employee_id, revoked_at, expires_at);

ALTER TABLE orders ADD COLUMN packing_status TEXT NOT NULL DEFAULT 'unpacked'
  CHECK (packing_status IN ('unpacked', 'packed'));
ALTER TABLE orders ADD COLUMN packed_at TEXT;
ALTER TABLE orders ADD COLUMN packed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_packing_status_created
  ON orders(packing_status, status, created_at ASC);

CREATE TABLE IF NOT EXISTS employee_audit_log (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  action TEXT NOT NULL,
  order_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employee_audit_created
  ON employee_audit_log(created_at DESC);

-- 0052 is the latest notification-table rebuild. Rebuild once more to allow
-- packing alerts while preserving every existing notification row.
PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS admin_notifications_new;
CREATE TABLE admin_notifications_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN (
    'new_order', 'low_stock', 'out_of_stock', 'new_review', 'product_question',
    'return_request', 'exchange_request', 'support_ticket', 'cancelled_order',
    'order_packed'
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

PRAGMA foreign_keys = ON;
