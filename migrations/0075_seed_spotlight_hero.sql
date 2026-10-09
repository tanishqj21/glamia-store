-- Seed the second cinematic treatment so it is immediately editable in Hero Studio.
-- The selected frames come from the currently live catalog and can be replaced by
-- the admin at any time.
INSERT OR IGNORE INTO hero_slides (
  id, variant, eyebrow, title, tagline, cta_label, cta_category,
  product_ids_json, words_json, position, active
)
SELECT
  'hero-seed-spotlight',
  'spotlight',
  'THE GLAMIA SPOTLIGHT',
  'The details make the mood.',
  'A closer look at considered pieces for slow mornings and easy evenings.',
  'Explore the edit',
  '',
  json_group_array(id),
  '["DETAILS","SOFT LAYERS","EVERYDAY"]',
  COALESCE((SELECT MAX(position) + 1 FROM hero_slides), 1),
  1
FROM (
  SELECT id
  FROM products
  WHERE status = 'live'
  ORDER BY updated_at DESC, created_at DESC
  LIMIT 3
);
