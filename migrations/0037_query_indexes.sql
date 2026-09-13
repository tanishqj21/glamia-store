-- Composite indexes for the hot catalogue, customer account, admin queue,
-- and coupon validation paths. JSON columns remain intentional for immutable
-- order/listing snapshots; searchable catalogue fields stay first-class.
CREATE INDEX IF NOT EXISTS idx_products_catalog_order
  ON products(status, featured DESC, rating DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category_catalog
  ON products(status, category, subcategory, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_color_catalog
  ON products(status, color, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_material_catalog
  ON products(status, material, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_price_catalog
  ON products(status, price, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_customer_created
  ON orders(customer_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON orders(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_product_visible_created
  ON reviews(product_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_sizes_available
  ON product_sizes(product_id, stock, size);

CREATE INDEX IF NOT EXISTS idx_coupons_active_window
  ON coupons(active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_coupon_targets_email_code
  ON coupon_email_targets(email, coupon_code);

CREATE INDEX IF NOT EXISTS idx_return_requests_customer_status
  ON return_requests(customer_email, status, created_at DESC);
