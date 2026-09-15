-- Optional seller-authored product specifications generated from the add-listing form.
ALTER TABLE products ADD COLUMN specifications TEXT NOT NULL DEFAULT '';
