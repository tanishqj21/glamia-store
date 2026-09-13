-- First-class pre-orders. A pre-order does not consume sellable inventory;
-- preorder_sold tracks commitments and is guarded atomically by D1.
ALTER TABLE products ADD COLUMN preorder_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN preorder_release_at TEXT;
ALTER TABLE products ADD COLUMN preorder_limit INTEGER;
ALTER TABLE products ADD COLUMN preorder_sold INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_preorder_catalog
  ON products(status, preorder_enabled, preorder_release_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_created_id
  ON orders(created_at DESC, id);

CREATE TRIGGER IF NOT EXISTS prevent_preorder_limit
BEFORE UPDATE OF preorder_sold ON products
WHEN NEW.preorder_limit IS NOT NULL AND NEW.preorder_sold > NEW.preorder_limit
BEGIN
  SELECT RAISE(ABORT, 'Pre-order limit reached');
END;

-- Releasing an order is already idempotent through order_stock_releases. This
-- companion trigger returns its pre-order commitments exactly once.
CREATE TRIGGER IF NOT EXISTS restore_preorder_after_order_release
AFTER INSERT ON order_stock_releases
BEGIN
  UPDATE products
  SET preorder_sold = MAX(0, preorder_sold - COALESCE((
    SELECT SUM(CAST(json_extract(item.value, '$.quantity') AS INTEGER))
    FROM orders released_order
    JOIN json_each(released_order.items_json) item
    WHERE released_order.id = NEW.order_id
      AND released_order.order_type = 'preorder'
      AND json_extract(item.value, '$.id') = products.id
      AND json_extract(item.value, '$.preorder') = 1
  ), 0))
  WHERE id IN (
    SELECT CAST(json_extract(item.value, '$.id') AS TEXT)
    FROM orders released_order
    JOIN json_each(released_order.items_json) item
    WHERE released_order.id = NEW.order_id
      AND released_order.order_type = 'preorder'
      AND json_extract(item.value, '$.preorder') = 1
  );
END;
