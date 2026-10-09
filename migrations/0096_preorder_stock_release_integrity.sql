-- Preorders reserve commitments, not physical inventory. Use the immutable
-- checkout snapshot, so changing a product's preorder setting cannot change
-- the stock restored by cancelling an earlier mixed order.
DROP TRIGGER restore_stock_after_order_release;
CREATE TRIGGER restore_stock_after_order_release
AFTER INSERT ON order_stock_releases
BEGIN
  UPDATE products SET stock = stock + COALESCE((
    SELECT SUM(CAST(json_extract(item.value, '$.quantity') AS INTEGER))
    FROM orders o, json_each(o.items_json) item
    WHERE o.id = NEW.order_id AND json_extract(item.value, '$.id') = products.id
      AND COALESCE(json_extract(item.value, '$.preorder'), 0) = 0
  ), 0)
  WHERE id IN (SELECT json_extract(item.value, '$.id') FROM orders o, json_each(o.items_json) item
    WHERE o.id = NEW.order_id AND COALESCE(json_extract(item.value, '$.preorder'), 0) = 0);

  UPDATE product_sizes SET stock = stock + COALESCE((
    SELECT SUM(CAST(json_extract(item.value, '$.quantity') AS INTEGER))
    FROM orders o, json_each(o.items_json) item
    WHERE o.id = NEW.order_id AND json_extract(item.value, '$.id') = product_sizes.product_id
      AND json_extract(item.value, '$.size') = product_sizes.size
      AND COALESCE(json_extract(item.value, '$.preorder'), 0) = 0
  ), 0)
  WHERE EXISTS (SELECT 1 FROM orders o, json_each(o.items_json) item
    WHERE o.id = NEW.order_id AND json_extract(item.value, '$.id') = product_sizes.product_id
      AND json_extract(item.value, '$.size') = product_sizes.size
      AND COALESCE(json_extract(item.value, '$.preorder'), 0) = 0);

  UPDATE inventory_reservations SET status = 'released', released_at = CURRENT_TIMESTAMP
    WHERE order_id = NEW.order_id AND status = 'committed';
END;
