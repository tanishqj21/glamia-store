-- Normalize order lines for indexed reporting and purchase checks while keeping
-- orders.items_json as the immutable customer-facing snapshot.
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  size TEXT NOT NULL DEFAULT '',
  variant TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_items_order_product_size
  ON order_items(order_id, product_id, size);
CREATE INDEX IF NOT EXISTS idx_order_items_product_created
  ON order_items(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items(order_id);

INSERT OR IGNORE INTO order_items (
  id, order_id, product_id, product_name, unit_price, quantity,
  size, variant, color, image_url, created_at
)
SELECT
  o.id || ':' || item.key,
  o.id,
  CAST(json_extract(item.value, '$.id') AS TEXT),
  COALESCE(CAST(json_extract(item.value, '$.name') AS TEXT), ''),
  COALESCE(CAST(json_extract(item.value, '$.price') AS INTEGER), 0),
  COALESCE(CAST(json_extract(item.value, '$.quantity') AS INTEGER), 1),
  COALESCE(CAST(json_extract(item.value, '$.size') AS TEXT), ''),
  COALESCE(CAST(json_extract(item.value, '$.variant') AS TEXT), ''),
  COALESCE(CAST(json_extract(item.value, '$.color') AS TEXT), ''),
  COALESCE(CAST(json_extract(item.value, '$.image') AS TEXT), ''),
  o.created_at
FROM orders o
JOIN json_each(o.items_json) item
WHERE json_valid(o.items_json)
  AND json_extract(item.value, '$.id') IS NOT NULL
  AND COALESCE(CAST(json_extract(item.value, '$.quantity') AS INTEGER), 0) > 0;

-- A normalized redemption ledger makes coupon limits indexable and provides an
-- authoritative write that can be included in the checkout batch.
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id TEXT PRIMARY KEY,
  coupon_code TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  order_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_code_email
  ON coupon_redemptions(coupon_code, customer_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_code
  ON coupon_redemptions(coupon_code, created_at DESC);

INSERT OR IGNORE INTO coupon_redemptions (id, coupon_code, customer_email, order_id, created_at)
SELECT 'legacy:' || id, coupon_code, customer_email, id, created_at
FROM orders
WHERE coupon_code IS NOT NULL
  AND coupon_code != ''
  AND status != 'cancelled';

CREATE TRIGGER IF NOT EXISTS enforce_coupon_redemption_limits
BEFORE INSERT ON coupon_redemptions
WHEN
  NOT EXISTS (
    SELECT 1 FROM coupons c
    WHERE c.code = NEW.coupon_code AND c.active = 1
  )
  OR EXISTS (
    SELECT 1 FROM coupons c
    WHERE c.code = NEW.coupon_code
      AND c.usage_limit IS NOT NULL
      AND (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_code = NEW.coupon_code) >= c.usage_limit
  )
  OR EXISTS (
    SELECT 1 FROM coupons c
    WHERE c.code = NEW.coupon_code
      AND c.per_user_limit IS NOT NULL
      AND (SELECT COUNT(*) FROM coupon_redemptions r
           WHERE r.coupon_code = NEW.coupon_code AND r.customer_email = NEW.customer_email) >= c.per_user_limit
  )
BEGIN
  SELECT RAISE(ABORT, 'Coupon redemption limit reached');
END;

-- Negative inventory aborts the entire D1 batch instead of requiring a
-- compensating write after a partial logical failure.
CREATE TRIGGER IF NOT EXISTS prevent_negative_product_stock
BEFORE UPDATE OF stock ON products
WHEN NEW.stock < 0
BEGIN
  SELECT RAISE(ABORT, 'Insufficient product stock');
END;

CREATE TRIGGER IF NOT EXISTS prevent_negative_size_stock
BEFORE UPDATE OF stock ON product_sizes
WHEN NEW.stock < 0
BEGIN
  SELECT RAISE(ABORT, 'Insufficient size stock');
END;

-- Inserting a release is idempotent because order_id is the primary key. The
-- trigger restores every order line exactly once, even under repeated requests.
CREATE TABLE IF NOT EXISTS order_stock_releases (
  order_id TEXT PRIMARY KEY,
  released_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS restore_stock_after_order_release
AFTER INSERT ON order_stock_releases
BEGIN
  UPDATE products
  SET stock = stock + COALESCE((
    SELECT SUM(oi.quantity)
    FROM order_items oi
    WHERE oi.order_id = NEW.order_id AND oi.product_id = products.id
  ), 0)
  WHERE id IN (SELECT product_id FROM order_items WHERE order_id = NEW.order_id);

  UPDATE product_sizes
  SET stock = stock + COALESCE((
    SELECT SUM(oi.quantity)
    FROM order_items oi
    WHERE oi.order_id = NEW.order_id
      AND oi.product_id = product_sizes.product_id
      AND oi.size = product_sizes.size
  ), 0)
  WHERE EXISTS (
    SELECT 1 FROM order_items oi
    WHERE oi.order_id = NEW.order_id
      AND oi.product_id = product_sizes.product_id
      AND oi.size = product_sizes.size
      AND oi.size != ''
  );

  UPDATE inventory_reservations
  SET status = 'released', released_at = CURRENT_TIMESTAMP
  WHERE order_id = NEW.order_id AND status = 'committed';
END;

-- Browse and coupon hot paths.
CREATE INDEX IF NOT EXISTS idx_products_status_category_stock_created
  ON products(status, category, stock, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_status_subcategory_stock_created
  ON products(status, subcategory, stock, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_coupon_customer_status
  ON orders(coupon_code, customer_email, status, created_at DESC);
DROP INDEX IF EXISTS idx_coupon_targets_email_code;

-- D1 supports FTS5. Search rows contain only live products and stay synchronized
-- through write-time triggers.
CREATE VIRTUAL TABLE IF NOT EXISTS product_search USING fts5(
  product_id UNINDEXED,
  name,
  brand,
  category,
  subcategory,
  color,
  material,
  tokenize = 'unicode61 remove_diacritics 2'
);

DELETE FROM product_search;
INSERT INTO product_search (product_id, name, brand, category, subcategory, color, material)
SELECT id, name, brand, category, subcategory, color, material
FROM products
WHERE status = 'live';

CREATE TRIGGER IF NOT EXISTS product_search_after_insert
AFTER INSERT ON products
WHEN NEW.status = 'live'
BEGIN
  INSERT INTO product_search (product_id, name, brand, category, subcategory, color, material)
  VALUES (NEW.id, NEW.name, NEW.brand, NEW.category, NEW.subcategory, NEW.color, NEW.material);
END;

CREATE TRIGGER IF NOT EXISTS product_search_after_delete
AFTER DELETE ON products
BEGIN
  DELETE FROM product_search WHERE product_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS product_search_after_update
AFTER UPDATE OF name, brand, category, subcategory, color, material, status ON products
BEGIN
  DELETE FROM product_search WHERE product_id = OLD.id;
  INSERT INTO product_search (product_id, name, brand, category, subcategory, color, material)
  SELECT NEW.id, NEW.name, NEW.brand, NEW.category, NEW.subcategory, NEW.color, NEW.material
  WHERE NEW.status = 'live';
END;
