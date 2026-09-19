-- Customer-facing notification centre and Expo push-token registration.
-- Internal admin notifications remain isolated from shopper accounts.

CREATE TABLE IF NOT EXISTS customer_push_tokens (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'unknown',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_push_tokens_user
  ON customer_push_tokens(user_email, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS customer_notifications (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  order_id TEXT,
  deep_link TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_notifications_user
  ON customer_notifications(user_email, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_notifications_order
  ON customer_notifications(order_id, created_at DESC);
