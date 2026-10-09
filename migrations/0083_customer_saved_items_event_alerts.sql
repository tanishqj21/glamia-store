-- Keep signed-in selections and opt-in campaign alerts separate from guest storage.
CREATE TABLE IF NOT EXISTS customer_saved_items (
  user_email TEXT PRIMARY KEY,
  cart_json TEXT NOT NULL DEFAULT '[]',
  wishlist_json TEXT NOT NULL DEFAULT '[]',
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_notification_preferences (
  user_email TEXT PRIMARY KEY,
  event_push_enabled INTEGER NOT NULL DEFAULT 0 CHECK (event_push_enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE events ADD COLUMN notify_customers INTEGER NOT NULL DEFAULT 0 CHECK (notify_customers IN (0, 1));
CREATE INDEX IF NOT EXISTS idx_events_alerts_due ON events(status, notify_customers, starts_at, ends_at);
