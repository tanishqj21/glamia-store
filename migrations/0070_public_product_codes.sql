-- Human-readable product codes are separate from the immutable internal UUID.
-- Existing UUID-backed URLs remain valid; newly created listings receive the
-- patterned code and sitemap URLs use it automatically.
ALTER TABLE products ADD COLUMN product_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_product_code
  ON products(product_code);

INSERT OR IGNORE INTO counters (name, value)
VALUES ('product_number', 0);
