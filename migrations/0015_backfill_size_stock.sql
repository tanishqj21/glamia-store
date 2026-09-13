-- Older listings stored only their aggregate stock. Give each declared size
-- an initial allocation so inventory and checkout can use size-level stock.
-- The remainder is assigned to the first sizes deterministically and the
-- allocations always add up to the existing product stock.
INSERT INTO product_sizes (product_id, size, stock)
SELECT
  p.id,
  CAST(size_row.value AS TEXT),
  CAST(p.stock / json_array_length(p.sizes_json) AS INTEGER)
    + CASE
        WHEN CAST(size_row.key AS INTEGER) < (p.stock % json_array_length(p.sizes_json)) THEN 1
        ELSE 0
      END
FROM products p
JOIN json_each(p.sizes_json) AS size_row
WHERE json_array_length(p.sizes_json) > 0
  AND NOT EXISTS (
    SELECT 1 FROM product_sizes existing
    WHERE existing.product_id = p.id
  );
