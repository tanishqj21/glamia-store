-- Warehouse address and optional shipment tracking details for courier labels.
ALTER TABLE orders ADD COLUMN tracking_number TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON orders(tracking_number);

INSERT OR IGNORE INTO storefront_settings (setting_key, value_json)
VALUES ('fulfillment', '{"warehouse_address":""}');
