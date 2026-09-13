-- Persist the Cash on Delivery availability switch in D1.
INSERT INTO storefront_settings (setting_key, value_json, updated_at)
VALUES ('payments', '{"cod_enabled":true}', CURRENT_TIMESTAMP)
ON CONFLICT(setting_key) DO NOTHING;
