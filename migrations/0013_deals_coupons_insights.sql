-- Deals gain an optional start time and a manual deal price.
ALTER TABLE products ADD COLUMN deal_starts_at TEXT;
ALTER TABLE products ADD COLUMN deal_price INTEGER;

-- Coupons can be scoped to the entire store, one category, or one product.
ALTER TABLE coupons ADD COLUMN scope TEXT NOT NULL DEFAULT 'all';
ALTER TABLE coupons ADD COLUMN scope_value TEXT NOT NULL DEFAULT '';

-- Lightweight shopping-behaviour events for the advanced dashboard.
CREATE TABLE cart_adds (
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE wishlist_adds (
  product_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cart_adds_product ON cart_adds(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_adds_product ON wishlist_adds(product_id);
