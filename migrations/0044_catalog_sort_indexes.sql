-- Keep the common category and subcategory sort paths index-backed. The
-- existing status/category indexes cover filtering, while these variants let
-- SQLite stream price and rating order without a temporary sort.
CREATE INDEX IF NOT EXISTS idx_products_status_category_price_created
  ON products(status, category, price, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_status_category_rating_created
  ON products(status, category, rating DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_status_subcategory_price_created
  ON products(status, subcategory, price, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_status_subcategory_rating_created
  ON products(status, subcategory, rating DESC, created_at DESC);
