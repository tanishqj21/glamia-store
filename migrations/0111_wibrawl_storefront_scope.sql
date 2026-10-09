ALTER TABLE products
  ADD COLUMN storefront_visibility TEXT NOT NULL DEFAULT 'glamia'
  CHECK (storefront_visibility IN ('glamia', 'wibrawl', 'both'));
