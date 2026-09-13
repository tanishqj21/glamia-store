-- Keep the size lookup ordered without a temporary sort. The primary key
-- already supports product_id lookups; this covering index also avoids table
-- reads while preserving the UI's size ordering.
DROP INDEX IF EXISTS idx_product_sizes_available;
CREATE INDEX IF NOT EXISTS idx_product_sizes_product_size_stock
  ON product_sizes(product_id, size, stock);
