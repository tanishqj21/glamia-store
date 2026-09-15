-- Give every transactional email a stable business-event key so retries and
-- repeated order updates cannot send the same message more than once.
ALTER TABLE email_delivery_log ADD COLUMN dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_delivery_dedupe
  ON email_delivery_log(dedupe_key)
  WHERE dedupe_key IS NOT NULL;
