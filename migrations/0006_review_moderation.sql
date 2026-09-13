ALTER TABLE reviews ADD COLUMN status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden'));

CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_email);
