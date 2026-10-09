-- Existing slides stay on Glamia; Wibrawl has its own publishing queue.
ALTER TABLE hero_slides ADD COLUMN storefront TEXT NOT NULL DEFAULT 'glamia'
  CHECK (storefront IN ('glamia', 'wibrawl'));
CREATE INDEX idx_hero_storefront_active_position ON hero_slides(storefront, active, position);
