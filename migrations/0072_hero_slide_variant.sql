-- Allow Hero Studio to choose between the original editorial composition and
-- the newer spotlight composition without creating a second slide table.
ALTER TABLE hero_slides ADD COLUMN variant TEXT NOT NULL DEFAULT 'editorial';

CREATE INDEX IF NOT EXISTS idx_hero_slides_variant
  ON hero_slides(variant, active, position);
