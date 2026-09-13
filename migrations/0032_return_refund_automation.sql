-- Keep a server-side refund amount and processing timestamp for after-sales automation.
ALTER TABLE return_requests ADD COLUMN refund_amount INTEGER;
ALTER TABLE return_requests ADD COLUMN refund_processed_at TEXT;
