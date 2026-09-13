-- 0008 set variant_group only on exploded colourway rows; the parent rows that
-- owned the legacy variants_json never joined their own group. Any product whose
-- id is referenced as another row's variant_group is that group's original parent.
UPDATE products SET variant_group = id
WHERE variant_group IS NULL
  AND id IN (SELECT variant_group FROM products WHERE variant_group IS NOT NULL);

-- Admin-managed categories
CREATE TABLE categories (
  name TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO categories (name)
SELECT DISTINCT category FROM products;

-- Deals: a product can carry a manual deal end time set by the admin
ALTER TABLE products ADD COLUMN deal_ends_at TEXT;
