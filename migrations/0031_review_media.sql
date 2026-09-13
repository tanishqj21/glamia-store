-- Customer reviews can optionally include a small set of product photos or videos.
ALTER TABLE reviews ADD COLUMN media_json TEXT NOT NULL DEFAULT '[]';

