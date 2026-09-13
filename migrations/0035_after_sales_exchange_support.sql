-- Unified customer return/refund requests plus same-product size exchanges.
-- The existing return_requests type check remains compatible by storing the
-- unified Return/Refund choice as the legacy `refund` value.
ALTER TABLE return_requests ADD COLUMN exchange_product_id TEXT;
ALTER TABLE return_requests ADD COLUMN exchange_from_size TEXT;
ALTER TABLE return_requests ADD COLUMN exchange_to_size TEXT;

CREATE INDEX IF NOT EXISTS idx_return_requests_exchange_product
  ON return_requests(exchange_product_id, exchange_to_size);
