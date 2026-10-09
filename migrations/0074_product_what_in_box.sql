-- Seller-authored contents for the product package.
ALTER TABLE products ADD COLUMN what_in_box TEXT NOT NULL DEFAULT '';
