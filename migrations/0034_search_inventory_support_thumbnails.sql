ALTER TABLE products ADD COLUMN thumbnail_url TEXT;
ALTER TABLE products ADD COLUMN thumbnail_key TEXT;
ALTER TABLE products ADD COLUMN thumbnail_images_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN thumbnail_keys_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN cost_price INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN reorder_point INTEGER NOT NULL DEFAULT 15;

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  order_id TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_email ON support_tickets(customer_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, priority, updated_at DESC);
