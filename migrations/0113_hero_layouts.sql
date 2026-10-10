-- Existing Glamia compositions remain editorial; Wibrawl gets selectable layouts.
ALTER TABLE hero_slides ADD COLUMN layout TEXT NOT NULL DEFAULT 'poster'
  CHECK (layout IN ('poster', 'collage', 'split'));
ALTER TABLE hero_slides ADD COLUMN imagery TEXT NOT NULL DEFAULT 'products'
  CHECK (imagery IN ('products', 'campaign'));
