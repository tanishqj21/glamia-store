-- Per-size stock: each listing tracks stock for every size it offers.
CREATE TABLE product_sizes (
  product_id TEXT NOT NULL,
  size TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, size)
);

CREATE INDEX IF NOT EXISTS idx_product_sizes_product ON product_sizes(product_id);
