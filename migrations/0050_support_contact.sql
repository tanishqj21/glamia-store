-- Admin-managed support contact details. The phone remains private until enabled.
INSERT OR IGNORE INTO storefront_settings (setting_key, value_json, updated_at)
VALUES ('support_contact', '{"visible":false,"country_code":"+91","phone_number":""}', CURRENT_TIMESTAMP);
