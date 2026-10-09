-- Keep scheduled opt-in event fan-out bounded as the customer base grows.
CREATE INDEX IF NOT EXISTS idx_customer_event_alert_opt_in ON customer_notification_preferences(event_push_enabled, user_email);
ALTER TABLE customer_notifications ADD COLUMN dispatch_batch TEXT;
CREATE INDEX IF NOT EXISTS idx_customer_notification_dispatch_batch ON customer_notifications(dispatch_batch) WHERE dispatch_batch IS NOT NULL;
