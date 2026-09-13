-- Admin-managed announcement bar and trust-strip content.
CREATE TABLE IF NOT EXISTS storefront_settings (
  setting_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO storefront_settings (setting_key, value_json) VALUES
  ('announcement', '{"visible":true,"text":"Complimentary shipping across India · Cash on Delivery available"}'),
  ('trust_strip', '{"visible":true,"items":[{"id":"shipping","visible":true,"title":"Free & Fast Shipping","body":"Complimentary on every order"},{"id":"returns","visible":true,"title":"7-Day Easy Returns","body":"Simple exchanges, no questions"},{"id":"cod","visible":true,"title":"Cash on Delivery","body":"Or secure UPI & card checkout"}]}');
