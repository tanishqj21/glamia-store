-- Persist which gallery image an admin selected as the thumbnail. The
-- compact thumbnail URL is stored separately, so re-opening a listing keeps
-- the selection even when the gallery order changes.
ALTER TABLE products ADD COLUMN thumbnail_source_url TEXT NOT NULL DEFAULT '';
