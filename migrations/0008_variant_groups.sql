-- Variants become standalone linked listings.
-- 1) every product can belong to a variant group (the original parent's id)
-- 2) legacy variants_json entries are exploded into real product rows sharing that group
ALTER TABLE products ADD COLUMN variant_group TEXT;

INSERT INTO products (
  id, seller_email, name, category, brand, price, mrp, stock, rating, status, featured,
  color, sizes_json, image_url, image_key, description, created_at, updated_at,
  material, images_json, image_keys_json, variants_json, variant_group
)
SELECT
  lower(hex(randomblob(16))),
  p.seller_email,
  p.name,
  p.category,
  p.brand,
  p.price,
  p.mrp,
  COALESCE(json_extract(v.value, '$.stock'), 0),
  p.rating,
  p.status,
  0,
  COALESCE(json_extract(v.value, '$.color'), ''),
  json_array(json_extract(v.value, '$.size')),
  COALESCE(json_extract(v.value, '$.images[0]'), p.image_url),
  NULL,
  p.description,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  p.material,
  COALESCE(json_extract(v.value, '$.images'), '[]'),
  COALESCE(json_extract(v.value, '$.image_keys'), '[]'),
  '[]',
  p.id
FROM products p, json_each(p.variants_json) AS v
WHERE json_array_length(p.variants_json) > 0;

UPDATE products SET variants_json = '[]' WHERE variants_json != '[]';

CREATE INDEX IF NOT EXISTS idx_products_variant_group ON products(variant_group);
