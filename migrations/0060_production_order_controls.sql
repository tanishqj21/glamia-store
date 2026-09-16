-- Production-prep controls that remain safe while checkout is demo-only:
-- retry-safe order creation, payment reconciliation metadata, and a database
-- guard against overselling when two checkouts arrive at the same time.
ALTER TABLE orders ADD COLUMN checkout_token TEXT;
ALTER TABLE orders ADD COLUMN payment_reference TEXT;
ALTER TABLE orders ADD COLUMN payment_updated_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_token
  ON orders(checkout_token)
  WHERE checkout_token IS NOT NULL AND checkout_token <> '';

-- Normal orders are inserted in the same D1 batch as their stock decrement.
-- This trigger validates the stock snapshot immediately before the insert so
-- a concurrent checkout cannot insert an order after the earlier validation
-- has become stale. Pre-orders intentionally bypass sellable stock checks.
CREATE TRIGGER IF NOT EXISTS prevent_unavailable_order_stock
BEFORE INSERT ON orders
WHEN NEW.order_type != 'replacement'
  AND (
    EXISTS (
      SELECT 1
      FROM json_each(NEW.items_json) item
      JOIN products p ON p.id = json_extract(item.value, '$.id')
      WHERE p.preorder_enabled = 0
        AND NOT EXISTS (SELECT 1 FROM product_sizes ps WHERE ps.product_id = p.id)
        AND p.stock < CAST(json_extract(item.value, '$.quantity') AS INTEGER)
    )
    OR EXISTS (
      SELECT 1
      FROM json_each(NEW.items_json) item
      JOIN products p ON p.id = json_extract(item.value, '$.id')
      WHERE p.preorder_enabled = 0
        AND json_extract(item.value, '$.size') != ''
        AND EXISTS (SELECT 1 FROM product_sizes ps WHERE ps.product_id = p.id)
        AND NOT EXISTS (
          SELECT 1
          FROM product_sizes ps
          WHERE ps.product_id = p.id
            AND ps.size = json_extract(item.value, '$.size')
            AND ps.stock >= CAST(json_extract(item.value, '$.quantity') AS INTEGER)
        )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'Insufficient order stock');
END;
