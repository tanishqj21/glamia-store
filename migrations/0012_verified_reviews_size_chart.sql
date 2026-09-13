-- Reviews open to all signed-in buyers: flag which ones come from verified purchasers.
ALTER TABLE reviews ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;

-- Admin-uploaded size chart image per listing.
ALTER TABLE products ADD COLUMN size_chart_url TEXT;
