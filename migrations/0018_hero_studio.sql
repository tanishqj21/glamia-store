-- Admin-managed home hero carousel slides.
CREATE TABLE IF NOT EXISTS hero_slides (
  id TEXT PRIMARY KEY,
  eyebrow TEXT NOT NULL DEFAULT 'The Glamia Edit',
  title TEXT NOT NULL,
  tagline TEXT NOT NULL,
  cta_label TEXT NOT NULL DEFAULT 'Shop now',
  cta_category TEXT NOT NULL DEFAULT '',
  product_ids_json TEXT NOT NULL DEFAULT '[]',
  words_json TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hero_slides_order ON hero_slides(active, position, created_at);

-- Start with the familiar demo carousel, which admins can immediately edit,
-- reorder, deactivate, or replace from Hero Studio.
INSERT OR IGNORE INTO hero_slides (
  id, eyebrow, title, tagline, cta_label, cta_category, product_ids_json,
  words_json, position, active
) VALUES
  ('hero-seed-women', 'The Glamia Edit', 'Explore Women',
   'Fluid silhouettes and refined essentials, made to be lived in.',
   'Shop Women', 'Women',
   '["seed-midnight-satin-dress","seed-wool-blend-blazer"]',
   '["SATIN","EDIT","NEW SEASON"]', 0, 1),
  ('hero-seed-men', 'The Glamia Edit', 'Explore Men',
   'Sharp shirting and relaxed tailoring for the modern gentleman.',
   'Shop Men', 'Men',
   '["seed-ivory-linen-shirt"]',
   '["LINEN","EDIT","NEW SEASON"]', 1, 1),
  ('hero-seed-ethnic', 'The Glamia Edit', 'Explore Ethnic',
   'Handwoven festive wear with a quietly luxurious finish.',
   'Shop Ethnic', 'Ethnic',
   '["seed-silk-kurta-set"]',
   '["SILK","EDIT","NEW SEASON"]', 2, 1);
