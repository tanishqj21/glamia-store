-- Tax metadata is kept on the listing and snapshotted onto each order line so
-- future GST/HSN changes do not rewrite the history of an earlier sale.
ALTER TABLE products ADD COLUMN hsn_sac_code TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN hsn_sac_type TEXT NOT NULL DEFAULT 'HSN';
ALTER TABLE products ADD COLUMN gst_rate REAL;
ALTER TABLE products ADD COLUMN gst_tax_inclusive INTEGER NOT NULL DEFAULT 1;

ALTER TABLE order_items ADD COLUMN hsn_sac_code TEXT NOT NULL DEFAULT '';
ALTER TABLE order_items ADD COLUMN hsn_sac_type TEXT NOT NULL DEFAULT 'HSN';
ALTER TABLE order_items ADD COLUMN gst_rate REAL;
ALTER TABLE order_items ADD COLUMN gst_tax_inclusive INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS tax_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  business_state TEXT NOT NULL DEFAULT '',
  business_state_code TEXT NOT NULL DEFAULT '',
  gstin TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO tax_settings (id) VALUES (1);

CREATE INDEX IF NOT EXISTS idx_products_tax_code ON products(hsn_sac_code);
CREATE INDEX IF NOT EXISTS idx_order_items_tax_code ON order_items(hsn_sac_code);
