-- Keep linked colourways/re-edits in one URL taxonomy. Older listings may have
-- an empty subcategory even though another product in the same variant group
-- is classified; inherit that existing classification for the blank siblings.
UPDATE products
SET subcategory = (
  SELECT sibling.subcategory
  FROM products AS sibling
  WHERE sibling.variant_group = products.variant_group
    AND sibling.id != products.id
    AND TRIM(COALESCE(sibling.subcategory, '')) <> ''
  ORDER BY sibling.created_at ASC, sibling.id ASC
  LIMIT 1
)
WHERE (subcategory IS NULL OR TRIM(subcategory) = '')
  AND variant_group IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM products AS sibling
    WHERE sibling.variant_group = products.variant_group
      AND sibling.id != products.id
      AND TRIM(COALESCE(sibling.subcategory, '')) <> ''
  );
